import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { safeSync } from '@/lib/sheets';
import { mapSessionRow } from '@/lib/sheets-mappers';
import { logAdminAction } from '@/lib/audit';

// EXT-I7: Bound the date window a logged-in client may request from
// /api/sessions. Without this, a member could pull the entire historical
// calendar in one shot and use it to enumerate session ids, memos, and
// usage patterns. 366 days covers any legitimate UI need (year view).
const SESSIONS_QUERY_MAX_DAYS = 366;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/sessions?from=2026-04-01&to=2026-04-30
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // EXT-I7: Per-IP rate limit for authenticated session listing. Members do
  // not legitimately need to fetch the calendar dozens of times per minute;
  // anything above this is an automation/scraping signal.
  if (auth.role !== 'admin') {
    const rl = rateLimit(req, 'sessions-list', { windowMs: 60_000, max: 60 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }
  }

  const fromRaw = req.nextUrl.searchParams.get('from');
  const toRaw = req.nextUrl.searchParams.get('to');

  // EXT-I7: Validate the YYYY-MM-DD format strictly so we never feed unparsed
  // user input into a SQL parameter (defence in depth — pg parameterises
  // anyway, but clear input contracts make audits easier).
  const from = fromRaw && ISO_DATE_RE.test(fromRaw) ? fromRaw : null;
  const to = toRaw && ISO_DATE_RE.test(toRaw) ? toRaw : null;

  // EXT-I7: Enforce a maximum window so a single request can't dump years of
  // history. If `to` is missing, derive a safe ceiling from `from`.
  let effectiveFrom = from;
  let effectiveTo = to;
  if (effectiveFrom && effectiveTo) {
    const fromMs = Date.parse(effectiveFrom + 'T00:00:00Z');
    const toMs = Date.parse(effectiveTo + 'T00:00:00Z');
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      return NextResponse.json({ error: '잘못된 날짜 형식입니다' }, { status: 400 });
    }
    if (toMs < fromMs) {
      return NextResponse.json({ error: 'to는 from보다 이후여야 합니다' }, { status: 400 });
    }
    if ((toMs - fromMs) / 86_400_000 > SESSIONS_QUERY_MAX_DAYS) {
      return NextResponse.json(
        { error: `조회 기간은 최대 ${SESSIONS_QUERY_MAX_DAYS}일까지 가능합니다` },
        { status: 400 }
      );
    }
  } else if (effectiveFrom && !effectiveTo) {
    const fromMs = Date.parse(effectiveFrom + 'T00:00:00Z');
    if (Number.isFinite(fromMs)) {
      effectiveTo = new Date(fromMs + SESSIONS_QUERY_MAX_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
    }
  } else if (!effectiveFrom) {
    // No range given → default to a 90-day forward window from today; this
    // matches the typical UI need and prevents an unbounded scan.
    const today = new Date();
    effectiveFrom = today.toISOString().slice(0, 10);
    effectiveTo = new Date(today.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
  }

  // EXT-I7: Hard cap on rows even when the date window is small (defence
  // against a future bug that bypasses the date filter).
  const HARD_ROW_CAP = 1000;

  let query = `
    SELECT s.*,
      (SELECT COUNT(*) FROM reservations r WHERE r.session_id = s.id AND r.status IN ('reserved', 'attended'))::int AS current_reservations,
      (SELECT COUNT(*) FROM waitlist w WHERE w.session_id = s.id AND w.status = 'waiting')::int AS waitlist_count
    FROM sessions s
  `;
  const params: any[] = [];

  if (effectiveFrom && effectiveTo) {
    query += ' WHERE s.date >= $1 AND s.date <= $2';
    params.push(effectiveFrom, effectiveTo);
  } else if (effectiveFrom) {
    query += ' WHERE s.date >= $1';
    params.push(effectiveFrom);
  }

  params.push(HARD_ROW_CAP);
  query += ` ORDER BY s.date, s.start_time LIMIT $${params.length}`;

  const sessions = await dbAll(query, params);

  const isAdmin = auth.role === 'admin';

  return NextResponse.json(sessions.map(s => {
    // EXT-I1: Admin notes (memo) MUST stay private unless the admin marked
    // the memo as public. Previously the API exposed `memo` to every
    // authenticated client regardless of `memo_public`, which leaked
    // operational notes (payment status, personal context, etc.) to any
    // logged-in member who hit the JSON endpoint directly.
    const memoVisible = isAdmin || !!s.memo_public;
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      location: s.location || '',
      locationAddress: s.location_address || '',
      locationMapUrl: s.location_map_url,
      maxCapacity: s.max_capacity,
      currentReservations: s.current_reservations,
      waitlistCount: s.waitlist_count,
      status: s.status,
      isIndoor: !!s.is_indoor,
      memo: memoVisible ? s.memo : null,
      memoPublic: !!s.memo_public,
      cancelDeadlineMinutes: s.cancel_deadline_minutes,
      recurringGroupId: s.recurring_group_id,
      // PR-7: pre-registration info card fields
      description: s.description ?? null,
      eventUrl: s.event_url ?? null,
      instagramUrl: s.instagram_url ?? null,
      kakaoOpenChatUrl: s.kakao_openchat_url ?? null,
      ribbon: s.ribbon ?? null,
      coverImageUrl: s.cover_image_url ?? null,
    };
  }));
}

// ─── PR-7 helpers ────────────────────────────────────────────────────────
// We accept only http(s) URLs to avoid javascript:/data: XSS vectors when
// the value is later rendered as <a href="..."> on the member detail page.
const SAFE_URL_RE = /^https?:\/\/[^\s<>"']{1,500}$/i;
const ALLOWED_RIBBONS = new Set([
  'none','new','hot','few_seats','beginner','special','event','rain_check',
]);

function sanitizeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (!SAFE_URL_RE.test(t)) return null;
  return t;
}
function sanitizeRibbon(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return ALLOWED_RIBBONS.has(v) ? v : null;
}
function sanitizeText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// POST /api/sessions - Admin only
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const body = await req.json();
    const id = genId('s');

    // PR-7: optional info-card fields. Sanitize so we never store unsafe
    // URLs or oversized blobs on the row.
    const description = sanitizeText(body.description, 2000);
    const eventUrl = sanitizeUrl(body.eventUrl);
    const instagramUrl = sanitizeUrl(body.instagramUrl);
    const kakaoOpenChatUrl = sanitizeUrl(body.kakaoOpenChatUrl);
    const locationMapUrl = sanitizeUrl(body.locationMapUrl);
    const coverImageUrl = sanitizeUrl(body.coverImageUrl);
    const ribbon = sanitizeRibbon(body.ribbon);

    await dbRun(`
      INSERT INTO sessions (
        id, name, type, date, start_time, end_time, location, location_address,
        location_map_url, max_capacity, status, is_indoor, memo, memo_public,
        cancel_deadline_minutes, recurring_group_id,
        description, event_url, instagram_url, kakao_openchat_url, ribbon, cover_image_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    `, [id, body.name, body.type, body.date, body.startTime, body.endTime || null,
      body.location || '', body.locationAddress || '', locationMapUrl,
      body.maxCapacity, !!body.isIndoor, body.memo || null, !!body.memoPublic,
      body.cancelDeadlineMinutes || 120, body.recurringGroupId || null,
      description, eventUrl, instagramUrl, kakaoOpenChatUrl, ribbon, coverImageUrl,
    ]);

    // Sheets mirror — Sessions tab upsert
    void safeSync('sessions', 'upsert', mapSessionRow({
      id, name: body.name, type: body.type, date: body.date,
      start_time: body.startTime, end_time: body.endTime || null,
      location: body.location || '',
      max_capacity: body.maxCapacity,
      current_reservations: 0, waitlist_count: 0,
      status: 'open', is_indoor: !!body.isIndoor,
    }));

    void logAdminAction(req, auth.memberId, {
      action: 'session.create',
      targetType: 'session',
      targetId: id,
      targetName: body.name,
      summary: `세션 생성 (${body.date} ${body.startTime})`,
      afterValue: {
        id, name: body.name, type: body.type, date: body.date,
        startTime: body.startTime, endTime: body.endTime,
        maxCapacity: body.maxCapacity,
      },
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[sessions POST] error:', error);
    return NextResponse.json({ error: '세션 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// PUT /api/sessions?id=xxx - Admin only. Edit an existing session.
//
// Accepts a partial body — only fields present in the body are updated, so
// the admin can tweak just the description without re-sending the whole row.
// Required fields (name/type/date/startTime/maxCapacity) cannot be set to an
// empty value: if they appear in the body they must be valid.
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const existing = await dbGet<any>(
    `SELECT * FROM sessions WHERE id = $1`, [id]
  );
  if (!existing) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 });
  }

  // Build dynamic SET clause. Each entry maps an incoming JSON key to its
  // SQL column name + the value to write (after validation/normalisation).
  const sets: { col: string; val: any }[] = [];

  // Required-but-optional-to-include fields. If present, must be non-empty.
  if (body.name !== undefined) {
    const v = typeof body.name === 'string' ? body.name.trim() : '';
    if (!v) return NextResponse.json({ error: '세션명을 입력하세요' }, { status: 400 });
    sets.push({ col: 'name', val: v.slice(0, 200) });
  }
  if (body.type !== undefined) {
    if (!['ebw', 'slowrun', 'marathon'].includes(body.type)) {
      return NextResponse.json({ error: '유형이 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'type', val: body.type });
  }
  if (body.date !== undefined) {
    if (typeof body.date !== 'string' || !ISO_DATE_RE.test(body.date)) {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'date', val: body.date });
  }
  if (body.startTime !== undefined) {
    if (typeof body.startTime !== 'string' || !/^\d{2}:\d{2}$/.test(body.startTime)) {
      return NextResponse.json({ error: '시작 시간이 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'start_time', val: body.startTime });
  }
  if (body.endTime !== undefined) {
    const v = body.endTime;
    if (v !== null && v !== '' && !(typeof v === 'string' && /^\d{2}:\d{2}$/.test(v))) {
      return NextResponse.json({ error: '종료 시간이 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'end_time', val: v || null });
  }
  if (body.location !== undefined) {
    sets.push({ col: 'location', val: typeof body.location === 'string' ? body.location.slice(0, 200) : '' });
  }
  if (body.locationAddress !== undefined) {
    sets.push({ col: 'location_address', val: typeof body.locationAddress === 'string' ? body.locationAddress.slice(0, 300) : '' });
  }
  if (body.locationMapUrl !== undefined) {
    sets.push({ col: 'location_map_url', val: sanitizeUrl(body.locationMapUrl) });
  }
  if (body.maxCapacity !== undefined) {
    const n = Number(body.maxCapacity);
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      return NextResponse.json({ error: '정원이 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'max_capacity', val: Math.floor(n) });
  }
  if (body.isIndoor !== undefined) {
    sets.push({ col: 'is_indoor', val: !!body.isIndoor });
  }
  if (body.memo !== undefined) {
    sets.push({ col: 'memo', val: typeof body.memo === 'string' ? body.memo.slice(0, 2000) : null });
  }
  if (body.memoPublic !== undefined) {
    sets.push({ col: 'memo_public', val: !!body.memoPublic });
  }
  if (body.cancelDeadlineMinutes !== undefined) {
    const n = Number(body.cancelDeadlineMinutes);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return NextResponse.json({ error: '취소 마감(분)이 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'cancel_deadline_minutes', val: Math.floor(n) });
  }
  if (body.status !== undefined) {
    if (!['open', 'closed', 'cancelled'].includes(body.status)) {
      return NextResponse.json({ error: '상태가 올바르지 않습니다' }, { status: 400 });
    }
    sets.push({ col: 'status', val: body.status });
  }

  // PR-7 info-card fields
  if (body.description !== undefined) {
    sets.push({ col: 'description', val: sanitizeText(body.description, 2000) });
  }
  if (body.eventUrl !== undefined) {
    sets.push({ col: 'event_url', val: sanitizeUrl(body.eventUrl) });
  }
  if (body.instagramUrl !== undefined) {
    sets.push({ col: 'instagram_url', val: sanitizeUrl(body.instagramUrl) });
  }
  if (body.kakaoOpenChatUrl !== undefined) {
    sets.push({ col: 'kakao_openchat_url', val: sanitizeUrl(body.kakaoOpenChatUrl) });
  }
  if (body.ribbon !== undefined) {
    sets.push({ col: 'ribbon', val: sanitizeRibbon(body.ribbon) });
  }
  if (body.coverImageUrl !== undefined) {
    sets.push({ col: 'cover_image_url', val: sanitizeUrl(body.coverImageUrl) });
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: '수정할 항목이 없습니다' }, { status: 400 });
  }

  // Always touch updated_at so the sheet sync / cache invalidation can rely on it.
  const setSql = sets.map((s, i) => `${s.col} = $${i + 1}`).join(', ');
  const params = sets.map(s => s.val);
  params.push(id);

  await dbRun(
    `UPDATE sessions SET ${setSql}, updated_at = NOW() WHERE id = $${params.length}`,
    params
  );

  // Sheets mirror — re-upsert the row with the latest values.
  try {
    const updated = await dbGet<any>(
      `SELECT id, name, type, date, start_time, end_time, location, max_capacity,
              status, is_indoor,
              (SELECT COUNT(*) FROM reservations r
                 WHERE r.session_id = s.id AND r.status IN ('reserved','attended'))::int AS current_reservations,
              (SELECT COUNT(*) FROM waitlist w
                 WHERE w.session_id = s.id AND w.status = 'waiting')::int AS waitlist_count
       FROM sessions s WHERE s.id = $1`, [id]
    );
    if (updated) {
      void safeSync('sessions', 'upsert', mapSessionRow(updated));
    }
  } catch { /* swallow */ }

  // Build a "diff summary" for the audit log so reviewers can see at a
  // glance which fields were touched without diffing JSON manually.
  const changedKeys = sets.map(s => s.col);
  void logAdminAction(req, auth.memberId, {
    action: 'session.update',
    targetType: 'session',
    targetId: id,
    targetName: existing.name ?? null,
    summary: `세션 수정: ${changedKeys.join(', ')}`,
    beforeValue: existing,
    afterValue: Object.fromEntries(sets.map(s => [s.col, s.val])),
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/sessions?id=xxx - Admin only
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  // M5: If reservations exist, mark as cancelled instead of hard delete to
  // preserve history and avoid cascading data loss.
  const reservationCount = await dbGet<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM reservations WHERE session_id = $1`,
    [id]
  );

  // Read existing session for audit context.
  const existingSession = await dbGet<any>(
    `SELECT id, name, type, date, start_time FROM sessions WHERE id = $1`,
    [id]
  );

  if (reservationCount && Number(reservationCount.count) > 0) {
    await dbRun("UPDATE sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [id]);

    // Sheets mirror — flip K(상태) to cancelled
    try {
      const updated = await dbGet<any>(
        `SELECT id, name, type, date, start_time, end_time, location, max_capacity,
                status, is_indoor
         FROM sessions WHERE id = $1`, [id]
      );
      if (updated) {
        void safeSync('sessions', 'upsert', mapSessionRow(updated));
      }
    } catch { /* swallow */ }

    void logAdminAction(req, auth.memberId, {
      action: 'session.delete',
      targetType: 'session',
      targetId: id,
      targetName: existingSession?.name ?? null,
      summary: '예약 이력이 있어 세션을 취소 상태로 전환',
      beforeValue: existingSession ?? undefined,
      afterValue: { status: 'cancelled' },
    });

    return NextResponse.json({ success: true, softDeleted: true, message: '예약 이력이 있어 세션을 취소 상태로 전환했습니다' });
  }

  await dbRun('DELETE FROM sessions WHERE id = $1', [id]);
  // Hard-deleted sessions: leave the sheet row as-is (manager comment is
  // preserved). The row simply becomes orphaned history. We don't try to
  // delete sheet rows because that would also wipe the manager's memo.

  void logAdminAction(req, auth.memberId, {
    action: 'session.delete',
    targetType: 'session',
    targetId: id,
    targetName: existingSession?.name ?? null,
    summary: '세션 영구 삭제 (예약 이력 없음)',
    beforeValue: existingSession ?? undefined,
  });

  return NextResponse.json({ success: true });
}
