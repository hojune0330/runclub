import { NextRequest, NextResponse } from 'next/server';
import { dbRun, genId } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import crypto from 'crypto';
import QRCode from 'qrcode';

// POST /api/qr/generate - Admin generates QR for a session
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId 필요' }, { status: 400 });


    // Invalidate old tokens for this session
    await dbRun("DELETE FROM qr_tokens WHERE session_id = $1", [sessionId]);

    // Generate cryptographic token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30000).toISOString(); // 30 seconds
    const id = genId('qr');

    await dbRun(`
      INSERT INTO qr_tokens (id, session_id, token, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [id, sessionId, token, expiresAt]);

    // Generate QR code as data URL
    const qrPayload = JSON.stringify({ sessionId, token, exp: expiresAt });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });

    return NextResponse.json({ token, expiresAt, qrDataUrl });
  } catch (error: any) {
    console.error('[qr/generate] error:', error);
    return NextResponse.json({ error: 'QR 코드 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}
