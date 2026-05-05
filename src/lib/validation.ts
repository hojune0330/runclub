/**
 * Input validation helpers shared between client and server.
 *
 * Keep these PURE — no I/O, no env access — so they can be used inside
 * React components for client-side feedback as well as inside API routes
 * for the authoritative check.
 */

export type Result<T = void> = { ok: true; value?: T } | { ok: false; message: string };

/**
 * Password policy:
 *   - 8자 이상 64자 이하
 *   - 영문(아무 케이스) 1자 이상 + 숫자 1자 이상
 *   - 공백 불가
 *
 * 일부러 특수문자는 강제하지 않습니다 (모바일 키보드에서 입력 마찰 ↑).
 */
export function validatePassword(pw: unknown): Result {
  if (typeof pw !== 'string') return { ok: false, message: '비밀번호가 필요합니다' };
  if (pw.length < 8) return { ok: false, message: '비밀번호는 8자 이상이어야 합니다' };
  if (pw.length > 64) return { ok: false, message: '비밀번호는 64자 이하여야 합니다' };
  if (/\s/.test(pw)) return { ok: false, message: '비밀번호에 공백을 사용할 수 없습니다' };
  if (!/[A-Za-z]/.test(pw)) return { ok: false, message: '비밀번호는 영문을 포함해야 합니다' };
  if (!/[0-9]/.test(pw)) return { ok: false, message: '비밀번호는 숫자를 포함해야 합니다' };
  return { ok: true };
}

/**
 * Korean mobile phone normaliser. Accepts:
 *   - 010-1234-5678
 *   - 01012345678
 *   - " 010 1234 5678 "
 *   - "+82 10-1234-5678"  (treated as 01012345678)
 * Returns the canonical "010-1234-5678" form, or null if invalid.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // Reject excessively long inputs early (DoS / abuse prevention).
  if (input.length > 32) return null;
  let digits = input.replace(/[^\d]/g, '');
  // +82 prefix → 0
  if (digits.startsWith('82')) digits = '0' + digits.slice(2);
  // 11 digits, must start with 010 (운영 시 011 등 다른 KT/SKT 구번호는 일단 거절)
  if (!/^010\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/**
 * Validate a human display name (member name, etc.).
 * - 1~30 chars after trim
 * - reject control chars, full whitespace lines, and obvious injection markers.
 */
export function validateName(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, message: '이름이 필요합니다' };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, message: '이름을 입력해주세요' };
  if (trimmed.length > 30) return { ok: false, message: '이름은 30자 이하여야 합니다' };
  // Disallow control chars (0x00-0x1F, 0x7F) — these have no legitimate use in
  // a name and are common in shell/log-injection payloads.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, message: '이름에 사용할 수 없는 문자가 포함되어 있습니다' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validate an optional email. Empty/undefined → ok with value undefined.
 * Hard cap at 254 chars (RFC 5321) and a basic structural check; we don't run
 * exhaustive RFC parsing — the goal is abuse mitigation, not perfect validation.
 */
export function validateEmail(input: unknown): Result<string | undefined> {
  if (input === undefined || input === null || input === '') {
    return { ok: true, value: undefined };
  }
  if (typeof input !== 'string') return { ok: false, message: '이메일 형식이 올바르지 않습니다' };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };
  if (trimmed.length > 254) return { ok: false, message: '이메일은 254자 이하여야 합니다' };
  // Conservative: must have exactly one @, with non-empty local & domain, and
  // the domain must contain a dot. No control chars or whitespace.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, message: '이메일 형식이 올바르지 않습니다' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { ok: false, message: '이메일 형식이 올바르지 않습니다' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Bounded free-text validator (memo, content, etc.).
 * Strips control chars and enforces a max length.
 */
export function validateText(
  input: unknown,
  opts: { max: number; required?: boolean; field?: string } = { max: 2000 }
): Result<string | undefined> {
  const field = opts.field ?? '입력값';
  if (input === undefined || input === null || input === '') {
    if (opts.required) return { ok: false, message: `${field}을(를) 입력해주세요` };
    return { ok: true, value: undefined };
  }
  if (typeof input !== 'string') return { ok: false, message: `${field} 형식이 올바르지 않습니다` };
  if (input.length > opts.max) {
    return { ok: false, message: `${field}은(는) ${opts.max}자 이하여야 합니다` };
  }
  // Strip C0 control chars (keep \n and \t for memo line breaks).
  const cleaned = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return { ok: true, value: cleaned };
}
