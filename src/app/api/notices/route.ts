import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { validateText } from '@/lib/validation';
import { readJsonBody } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/audit';

// EXT-I6: Hard cap on notices a single GET can return. The previous version
// dumped the entire `notices` table — fine when there are 5 rows, dangerous
// once an operator has months of postings. A scraper could pull every notice
// in one request, including session-targeted operational details.
const NOTICES_DEFAULT_LIMIT = 50;
const NOTICES_MAX_LIMIT = 200;

// EXT-I11: Defensive JSON parser for notices.target_sessions. The column
// is TEXT and may contain malformed JSON from old rows or future migrations;
// throwing here would 500 the entire endpoint for every caller. We log and
// fall back to "unknown / not targeted" instead.
function safeParseTargetSessions(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    // Coerce to string[] and reject obviously malformed entries.
    const cleaned = parsed.filter(x => typeof x === 'string' && x.length > 0 && x.length <= 64);
    return cleaned.length > 0 ? cleaned : undefined;
  } catch {
    return undefined;
  }
}

// GET /api/notices?limit=50&before=2026-01-01T00:00:00Z
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  // EXT-I6: Per-IP rate limit on notice listing.
  if (auth.role !== 'admin') {
    const rl = rateLimit(req, 'notices-list', { windowMs: 60_000, max: 60 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }
  }

  // EXT-I6: Validate and clamp pagination parameters.
  const limitRaw = parseInt(req.nextUrl.searchParams.get('limit') || '', 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(NOTICES_MAX_LIMIT, limitRaw)
      : NOTICES_DEFAULT_LIMIT;
  const beforeRaw = req.nextUrl.searchParams.get('before');
  // Cursor is an ISO timestamp; we accept only sane lengths to avoid abuse.
  const before =
    beforeRaw && beforeRaw.length <= 40 && !Number.isNaN(Date.parse(beforeRaw))
      ? beforeRaw
      : null;

  let query = `
    SELECT n.*,
      CASE WHEN nr.member_id IS NOT NULL THEN 1 ELSE 0 END as is_read
    FROM notices n
    LEFT JOIN notice_reads nr ON n.id = nr.notice_id AND nr.member_id = $1
  `;
  const params: any[] = [auth.memberId];
  if (before) {
    params.push(before);
    query += ` WHERE n.created_at < $${params.length}`;
  }
  params.push(limit);
  query += ` ORDER BY n.created_at DESC LIMIT $${params.length}`;

  const notices = await dbAll(query, params);

  return NextResponse.json({
    notices: notices.map(n => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      // EXT-I11: defensive parse — never throw on malformed TEXT.
      targetSessions: safeParseTargetSessions(n.target_sessions),
      isRead: !!n.is_read,
    })),
    // Cursor for the next page (oldest createdAt in this batch). Clients
    // pass it back as `?before=...` to load older notices.
    nextBefore: notices.length === limit
      ? notices[notices.length - 1]?.created_at ?? null
      : null,
    limit,
  });
}

// POST /api/notices - Admin only
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    let body: any;
    try {
      body = await readJsonBody(req, 64 * 1024); // notices may be longer
    } catch (e: any) {
      if (e?.name === 'BodyTooLargeError') {
        return NextResponse.json({ error: '요청 본문이 너무 큽니다' }, { status: 413 });
      }
      throw e;
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }
    const { title, content, targetSessions } = body as Record<string, unknown>;

    // EXT-H6: bound title and content lengths to prevent stored-payload abuse.
    const titleCheck = validateText(title, { max: 200, required: true, field: '제목' });
    if (!titleCheck.ok) return NextResponse.json({ error: titleCheck.message }, { status: 400 });
    const contentCheck = validateText(content, { max: 10_000, required: true, field: '내용' });
    if (!contentCheck.ok) return NextResponse.json({ error: contentCheck.message }, { status: 400 });

    // targetSessions must be a small array of session ids.
    let serializedTargets: string | null = null;
    if (Array.isArray(targetSessions)) {
      if (targetSessions.length > 200) {
        return NextResponse.json({ error: '대상 세션이 너무 많습니다' }, { status: 400 });
      }
      const cleaned = targetSessions.filter(
        s => typeof s === 'string' && s.length > 0 && s.length <= 64
      );
      serializedTargets = JSON.stringify(cleaned);
    }

    const id = genId('n');

    await dbRun(`
      INSERT INTO notices (id, title, content, target_sessions, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [id, titleCheck.value!, contentCheck.value!, serializedTargets]);

    void logAdminAction(req, auth.memberId, {
      action: 'notice.create',
      targetType: 'notice',
      targetId: id,
      targetName: titleCheck.value!,
      summary: `공지 등록: ${titleCheck.value!.slice(0, 60)}`,
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[notices POST] error:', error);
    return NextResponse.json({ error: '공지 등록 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// PUT /api/notices - Mark as read (member) or update (admin)
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    let body: any;
    try {
      body = await readJsonBody(req, 64 * 1024);
    } catch (e: any) {
      if (e?.name === 'BodyTooLargeError') {
        return NextResponse.json({ error: '요청 본문이 너무 큽니다' }, { status: 413 });
      }
      throw e;
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }
    const { noticeId, action, title, content, targetSessions } = body as Record<string, unknown>;
    if (typeof noticeId !== 'string' || !noticeId || noticeId.length > 64) {
      return NextResponse.json({ error: 'noticeId 필요' }, { status: 400 });
    }


    if (action === 'read') {
      // PostgreSQL equivalent of SQLite's "INSERT OR IGNORE".
      // PRIMARY KEY (notice_id, member_id) makes this idempotent.
      await dbRun(`
        INSERT INTO notice_reads (notice_id, member_id)
        VALUES ($1, $2)
        ON CONFLICT (notice_id, member_id) DO NOTHING
      `, [noticeId, auth.memberId]);
      return NextResponse.json({ success: true });
    }

    // Admin update
    if (auth.role !== 'admin') return forbiddenResponse();

    // EXT-H6: optional fields — validate length when provided.
    let safeTitle: string | null = null;
    if (title !== undefined && title !== null) {
      const c = validateText(title, { max: 200, field: '제목' });
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeTitle = c.value ?? null;
    }
    let safeContent: string | null = null;
    if (content !== undefined && content !== null) {
      const c = validateText(content, { max: 10_000, field: '내용' });
      if (!c.ok) return NextResponse.json({ error: c.message }, { status: 400 });
      safeContent = c.value ?? null;
    }
    let serializedTargets: string | null = null;
    if (Array.isArray(targetSessions)) {
      if (targetSessions.length > 200) {
        return NextResponse.json({ error: '대상 세션이 너무 많습니다' }, { status: 400 });
      }
      const cleaned = targetSessions.filter(
        s => typeof s === 'string' && s.length > 0 && s.length <= 64
      );
      serializedTargets = JSON.stringify(cleaned);
    }

    await dbRun(`
      UPDATE notices SET title = COALESCE($1, title), content = COALESCE($2, content),
        target_sessions = $3, updated_at = NOW()
      WHERE id = $4
    `, [safeTitle, safeContent, serializedTargets, noticeId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[notices PUT] error:', error);
    return NextResponse.json({ error: '공지 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// DELETE /api/notices?id=xxx - Admin only
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  // Capture title for audit before deletion (lightweight read).
  const existing = await (await import('@/lib/db')).dbGet<{ title: string }>(
    'SELECT title FROM notices WHERE id = $1',
    [id]
  );

  await dbRun('DELETE FROM notices WHERE id = $1', [id]);

  void logAdminAction(req, auth.memberId, {
    action: 'notice.delete',
    targetType: 'notice',
    targetId: id,
    targetName: existing?.title ?? null,
    summary: '공지 삭제',
  });

  return NextResponse.json({ success: true });
}
