import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

// GET /api/waitlist?sessionId=xxx
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  const sessionId = req.nextUrl.searchParams.get('sessionId');

  // EXT-H8: Use a placeholder counter so the parameter indices remain
  // consistent regardless of which branch is taken. The previous code used a
  // hard-coded `$2` in the second branch with only one element in `params`,
  // which would have produced a runtime SQL error if ever reached.
  let query = `
    SELECT w.*, m.name as member_name FROM waitlist w
    JOIN members m ON w.member_id = m.id
    WHERE w.status = 'waiting'
  `;
  const params: any[] = [];
  let p = 0;

  if (sessionId) {
    p += 1;
    query += ` AND w.session_id = $${p}`;
    params.push(sessionId);
    if (auth.role !== 'admin') {
      // Even when a sessionId is given, a non-admin should only see their own
      // waitlist row to avoid leaking other members' identities.
      p += 1;
      query += ` AND w.member_id = $${p}`;
      params.push(auth.memberId);
    }
  } else if (auth.role !== 'admin') {
    p += 1;
    query += ` AND w.member_id = $${p}`;
    params.push(auth.memberId);
  }

  query += ' ORDER BY w.position ASC';

  const entries = await dbAll(query, params);

  // EXT-H8 (PII): Mask other members' names for non-admins. A non-admin
  // realistically only ever sees their own row after the filter above, but we
  // keep the mask defensively in case an admin-only field is added later.
  const isAdmin = auth.role === 'admin';
  const maskName = (name: string | null | undefined): string => {
    if (!name) return '';
    const trimmed = String(name).trim();
    if (trimmed.length === 0) return '';
    return trimmed[0] + '*'.repeat(Math.max(1, trimmed.length - 1));
  };

  return NextResponse.json(entries.map(w => {
    const isOwn = w.member_id === auth.memberId;
    return {
      id: w.id,
      memberId: w.member_id,
      memberName: isAdmin || isOwn ? w.member_name : maskName(w.member_name),
      sessionId: w.session_id,
      position: w.position,
      status: w.status,
      createdAt: w.created_at,
    };
  }));
}

// POST /api/waitlist - Join waitlist
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const { sessionId } = await req.json();
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 64) {
      return NextResponse.json({ error: 'sessionId가 올바르지 않습니다' }, { status: 400 });
    }

    // EXT-M3: Verify the session exists and is not cancelled.
    const session = await dbGet<{ status: string }>(
      'SELECT status FROM sessions WHERE id = $1',
      [sessionId]
    );
    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    }
    if (session.status === 'cancelled') {
      return NextResponse.json({ error: '취소된 세션입니다' }, { status: 400 });
    }

    // EXT-M3: Prevent duplicate waiting entries for the same member+session.
    const dup = await dbGet(
      "SELECT id FROM waitlist WHERE member_id = $1 AND session_id = $2 AND status = 'waiting'",
      [auth.memberId, sessionId]
    );
    if (dup) {
      return NextResponse.json({ error: '이미 대기 등록되어 있습니다' }, { status: 409 });
    }

    // Get current max position
    const maxPos = await dbGet<{ pos: number | null }>(
      "SELECT MAX(position) as pos FROM waitlist WHERE session_id = $1 AND status = 'waiting'",
      [sessionId]
    );

    const position = (maxPos?.pos || 0) + 1;
    const id = genId('w');

    await dbRun(`
      INSERT INTO waitlist (id, member_id, session_id, position, status, created_at)
      VALUES ($1, $2, $3, $4, 'waiting', NOW())
    `, [id, auth.memberId, sessionId, position]);

    return NextResponse.json({ id, position, success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[waitlist POST] error:', error);
    return NextResponse.json({ error: '대기 등록 중 오류가 발생했습니다' }, { status: 500 });
  }
}

// PUT /api/waitlist - Cancel waitlist entry
export async function PUT(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();

  try {
    const { waitlistId } = await req.json();

    const entry = await dbGet('SELECT * FROM waitlist WHERE id = $1', [waitlistId]);
    if (!entry) return NextResponse.json({ error: '대기 항목을 찾을 수 없습니다' }, { status: 404 });
    if (auth.role !== 'admin' && auth.memberId !== entry.member_id) return forbiddenResponse();

    await dbRun("UPDATE waitlist SET status = 'cancelled' WHERE id = $1", [waitlistId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[waitlist PUT] error:', error);
    return NextResponse.json({ error: '대기 항목 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
