/**
 * HTTP request helpers — keep small, pure, and reusable across API routes.
 *
 * EXT-H1: All API routes that read JSON bodies should go through readJsonBody()
 * to enforce a hard size cap. Without this, an attacker can send 100MB of
 * JSON to exhaust process memory before our route logic ever runs.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const DEFAULT_MAX_BODY_BYTES = 32 * 1024; // 32 KiB — generous for our forms.

export class BodyTooLargeError extends Error {
  constructor(public limit: number) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Safely read & parse a JSON body with a size cap.
 *
 * Behaviour:
 *  - If Content-Length is present and exceeds the cap, throw immediately.
 *  - Otherwise, read the raw text and re-check length post-read.
 *  - On invalid JSON returns null (caller treats as "no body" / 400).
 */
export async function readJsonBody<T = any>(
  req: NextRequest,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<T | null> {
  const cl = req.headers.get('content-length');
  if (cl) {
    const n = parseInt(cl, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      throw new BodyTooLargeError(maxBytes);
    }
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (text.length > maxBytes) {
    throw new BodyTooLargeError(maxBytes);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { error: '요청 본문이 너무 큽니다' },
    { status: 413 }
  );
}
