import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun, genId, ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { sendPushToMembers } from '@/lib/push';
import { mapEncouragementRow, ENCOURAGEMENT_KINDS } from '@/lib/coaching';

// GET /api/encouragements?targetType=activity&targetId=...
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  const targetType = req.nextUrl.searchParams.get('targetType') === 'homework_submission' ? 'homework_submission' : 'activity';
  const targetId = req.nextUrl.searchParams.get('targetId');
  if (!targetId) return NextResponse.json({ error: 'targetId가 필요합니다' }, { status: 400 });

  try {
    const rows = await dbAll<any>(
      `SELECT e.*, m.name AS member_name FROM encouragements e
         JOIN members m ON e.member_id = m.id
        WHERE e.target_type = $1 AND e.target_id = $2
        ORDER BY e.created_at ASC`,
      [targetType, targetId]
    );
    return NextResponse.json({ encouragements: rows.map(mapEncouragementRow) });
  } catch (e) {
    console.error('[encouragements GET] error:', e);
    return NextResponse.json({ error: '응원을 불러오지 못했습니다' }, { status: 500 });
  }
}

// 대상의 소유자(member_id) 조회 — 알림용
async function resolveTargetOwner(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === 'homework_submission') {
    const r = await dbGet<any>(`SELECT member_id FROM homework_submissions WHERE id = $1`, [targetId]);
    return r?.member_id ?? null;
  }
  const r = await dbGet<any>(`SELECT member_id FROM activity_logs WHERE id = $1`, [targetId]);
  return r?.member_id ?? null;
}

// POST /api/encouragements — 응원 추가. cheer/fire는 토글(이미 있으면 제거), comment는 추가.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();

  try {
    const body = await req.json();
    const targetType = body?.targetType === 'homework_submission' ? 'homework_submission' : 'activity';
    const targetId = String(body?.targetId ?? '');
    const kind = ENCOURAGEMENT_KINDS.includes(body?.kind) ? body.kind : 'cheer';
    const comment = kind === 'comment' ? String(body?.comment ?? '').trim().slice(0, 300) : null;

    if (!targetId) return NextResponse.json({ error: 'targetId가 필요합니다' }, { status: 400 });
    if (kind === 'comment' && !comment) return NextResponse.json({ error: '댓글 내용을 입력해주세요' }, { status: 400 });

    const owner = await resolveTargetOwner(targetType, targetId);
    if (!owner) return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });

    // cheer/fire 토글
    if (kind !== 'comment') {
      const existing = await dbGet<any>(
        `SELECT id FROM encouragements WHERE member_id = $1 AND target_type = $2 AND target_id = $3 AND kind = $4`,
        [auth.memberId, targetType, targetId, kind]
      );
      if (existing) {
        await dbRun(`DELETE FROM encouragements WHERE id = $1`, [existing.id]);
        return NextResponse.json({ toggled: 'off' });
      }
    }

    const id = genId('enc');
    await dbRun(
      `INSERT INTO encouragements (id, member_id, target_type, target_id, kind, comment)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, auth.memberId, targetType, targetId, kind, comment]
    );

    // 본인 글이 아니면 알림
    if (owner !== auth.memberId) {
      const me = await dbGet<any>(`SELECT name FROM members WHERE id = $1`, [auth.memberId]);
      void sendPushToMembers([owner], {
        title: kind === 'comment' ? '새 댓글이 달렸어요' : '응원을 받았어요 👏',
        body: kind === 'comment' ? `${me?.name ?? '동료'}: ${comment}` : `${me?.name ?? '동료'}님이 응원했어요!`,
        url: '/app',
        tag: 'encouragement',
      });
    }

    const row = await dbGet<any>(
      `SELECT e.*, m.name AS member_name FROM encouragements e JOIN members m ON e.member_id = m.id WHERE e.id = $1`,
      [id]
    );
    return NextResponse.json({ encouragement: row ? mapEncouragementRow(row) : null, toggled: 'on' }, { status: 201 });
  } catch (e) {
    console.error('[encouragements POST] error:', e);
    return NextResponse.json({ error: '응원 처리에 실패했습니다' }, { status: 500 });
  }
}

// DELETE /api/encouragements?id=  — 본인 댓글/응원 삭제
export async function DELETE(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  await ensureSchema();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

  try {
    const row = await dbGet<any>(`SELECT member_id FROM encouragements WHERE id = $1`, [id]);
    if (!row) return NextResponse.json({ error: '찾을 수 없습니다' }, { status: 404 });
    if (row.member_id !== auth.memberId && auth.role !== 'admin') {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }
    await dbRun(`DELETE FROM encouragements WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[encouragements DELETE] error:', e);
    return NextResponse.json({ error: '삭제에 실패했습니다' }, { status: 500 });
  }
}
