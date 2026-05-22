import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import crypto from 'crypto';
import QRCode from 'qrcode';

const QR_TTL_MS = 120_000;

function resolveAppOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host')?.trim();
  if (host) return `${forwardedProto || 'https'}://${host}`;
  return req.nextUrl.origin.replace(/\/+$/, '');
}

// POST /api/qr/generate - Admin generates QR for a session
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId 필요' }, { status: 400 });


    const session = await dbGet<{ id: string; name: string; date: string; start_time: string; status: string }>(
      'SELECT id, name, date, start_time, status FROM sessions WHERE id = $1',
      [sessionId]
    );
    if (!session) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    if (session.status === 'cancelled') {
      return NextResponse.json({ error: '취소된 세션의 QR은 생성할 수 없습니다' }, { status: 400 });
    }

    // Keep a short overlap window so people who scanned a just-refreshed QR do
    // not fail immediately. Only expired/old tokens are removed.
    await dbRun("DELETE FROM qr_tokens WHERE session_id = $1 AND expires_at < NOW() - INTERVAL '5 minutes'", [sessionId]);

    // Generate cryptographic token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
    const id = genId('qr');

    await dbRun(`
      INSERT INTO qr_tokens (id, session_id, token, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [id, sessionId, token, expiresAt]);

    const checkinUrl = `${resolveAppOrigin(req)}/checkin?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;

    // Generate QR code as a URL so phone-native cameras can open it directly.
    // The member app scanner still accepts the legacy JSON payload.
    const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });

    void logAdminAction(req, auth.memberId, {
      action: 'qr.generate',
      targetType: 'qr',
      targetId: id,
      targetName: session.name,
      summary: `${session.name}(${session.date} ${session.start_time}) QR 발급`,
      afterValue: { sessionId, expiresAt, ttlSec: QR_TTL_MS / 1000 },
    });

    return NextResponse.json({ token, expiresAt, qrDataUrl, checkinUrl, ttlSec: QR_TTL_MS / 1000 });
  } catch (error: any) {
    console.error('[qr/generate] error:', error);
    return NextResponse.json({ error: 'QR 코드 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}
