import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse } from '@/lib/auth';
import { sendPushToMembers } from '@/lib/push';

// ─────────────────────────────────────────────────────────────────────
// POST /api/notifications/send
//
// Admin-only: sends a push notification to all members or specific ones.
//
// Body:
//   { title: string, body: string, memberIds?: string[], url?: string }
// ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, body: messageBody, memberIds, url, requireInteraction } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: 'title과 body는 필수입니다' },
        { status: 400 }
      );
    }

    const result = await sendPushToMembers(memberIds || [], {
      title,
      body: messageBody,
      url: url || undefined,
      requireInteraction: requireInteraction ?? false,
    });

    return NextResponse.json({
      success: true,
      sent: result.success,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error('[notifications/send] error:', error);
    return NextResponse.json(
      { error: '알림 발송 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
