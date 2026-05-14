import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbGet, dbRun } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';

// POST /api/reservations/bulk-noshow
//
// 관리자 전용. 특정 세션의 reserved 상태 예약 전원을 noshow 로 일괄 전환.
// 세션이 끝난 뒤 출석 체크되지 않은 사람을 한 번에 정리할 때 사용.
//
// 수강권 정책: reserved(차감 상태) → noshow(비차감)로 가므로, count 형
// 패스를 1회 환원해야 한다. 그러나 노쇼는 페널티성이므로 운영 의도상
// **환원하지 않는 것이 정상**. (사용자가 노쇼 처리됐는데 패스도 안 깎인다면
// 노쇼 책임이 약해진다.) 따라서 일괄 처리에서는 패스를 환원하지 않는다.
//
// 만약 회원이 정정 요청을 보내 "사실은 출석했다" 가 승인되면 그때
// PATCH /api/reservations 로 attended 전환되어 패스 차감은 그대로 유지된다.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId가 필요합니다' }, { status: 400 });
    }

    const session = await dbGet<any>(
      'SELECT id, name, date FROM sessions WHERE id = $1',
      [sessionId]
    );
    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    }

    const reserved = await dbAll<any>(
      `SELECT r.id, m.name AS member_name
         FROM reservations r
         JOIN members m ON r.member_id = m.id
        WHERE r.session_id = $1 AND r.status = 'reserved'`,
      [sessionId]
    );

    if (reserved.length === 0) {
      return NextResponse.json({ success: true, affected: 0 });
    }

    await dbRun(
      `UPDATE reservations
          SET status = 'noshow'
        WHERE session_id = $1 AND status = 'reserved'`,
      [sessionId]
    );

    void logAdminAction(req, auth.memberId, {
      action: 'reservation.bulk_noshow',
      targetType: 'session',
      targetId: sessionId,
      targetName: session.name,
      summary: `${session.name} (${session.date}) 미확정 예약 ${reserved.length}건을 노쇼로 일괄 처리`,
      afterValue: {
        affected: reserved.length,
        memberNames: reserved.map(r => r.member_name),
      },
    });

    return NextResponse.json({ success: true, affected: reserved.length });
  } catch (error: any) {
    console.error('[reservations/bulk-noshow POST] error:', error);
    return NextResponse.json(
      { error: '일괄 노쇼 처리 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
