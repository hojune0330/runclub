/**
 * DB row → Google Sheets row mappers.
 *
 * Centralised here so the column order is defined ONCE and every API
 * trigger stays a one-liner. If the sheet layout ever changes, only this
 * file (+ scripts/sheet-init.mjs HEADERS) needs to be touched.
 *
 * IMPORTANT: each mapper returns ONLY the DB-owned column range. Manager
 * memo columns (Members J~O / Passes O / Sessions N) are deliberately
 * absent so upserts never overwrite them.
 */

export type SheetCell = string | number | boolean | null;
export type SheetRow = SheetCell[];

const nowIso = () => new Date().toISOString();

// ─── Members (A..I, 9 columns) ────────────────────────────────────────────
//
// A 회원ID | B 이름 | C 연락처 | D 이메일 | E 권한
// F 가입일 | G 활성여부 | H 시스템메모 | I 최종동기화

export interface MemberLike {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  join_date?: string | null;
  joinDate?: string | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  memo?: string | null;
}

export function mapMemberRow(m: MemberLike): SheetRow {
  return [
    m.id,
    m.name ?? '',
    m.phone ?? '',
    m.email ?? '',
    m.role ?? 'member',
    m.join_date ?? m.joinDate ?? '',
    m.is_active ?? m.isActive ?? true,
    m.memo ?? '',
    nowIso(),
  ];
}

// ─── Passes (A..N, 14 columns) ────────────────────────────────────────────
//
// A 수강권ID | B 회원ID | C 회원이름 | D 상품명 | E 카테고리
// F 총횟수 | G 잔여횟수 | H 시작일 | I 만료일 | J 발급일
// K 상태 | L 일시정지시각 | M 가격 | N 최종동기화

export interface PassLike {
  id: string;
  member_id: string;
  member_name?: string | null;
  product_name?: string | null;
  category?: string | null;
  total_count?: number | null;
  remaining_count?: number | null;
  start_date?: string | null;
  expiry_date?: string | null;
  issued_date?: string | null;
  status?: string | null;
  paused_at?: string | null;
  price?: number | null;
}

export function mapPassRow(p: PassLike): SheetRow {
  return [
    p.id,
    p.member_id,
    p.member_name ?? '',
    p.product_name ?? '',
    p.category ?? '',
    p.total_count ?? '',
    p.remaining_count ?? '',
    p.start_date ?? '',
    p.expiry_date ?? '',
    p.issued_date ?? '',
    p.status ?? 'active',
    p.paused_at ?? '',
    p.price ?? '',
    nowIso(),
  ];
}

// ─── Attendance (A..K, 11 columns, append-only) ──────────────────────────
//
// A 출석ID | B 회원ID | C 회원이름 | D 세션ID | E 세션명
// F 세션일자 | G 시작시간 | H 체크인시각 | I 출석상태 | J 사용수강권ID
// K 동기화시각

export interface AttendanceLike {
  id: string; // reservation.id
  member_id: string;
  member_name?: string | null;
  session_id: string;
  session_name?: string | null;
  session_date?: string | null;
  session_start_time?: string | null;
  checked_in_at?: string | null;
  status: string; // 'attended' | 'cancelled' | 'noshow' | 'reserved'
  pass_id?: string | null;
}

export function mapAttendanceRow(a: AttendanceLike): SheetRow {
  return [
    a.id,
    a.member_id,
    a.member_name ?? '',
    a.session_id,
    a.session_name ?? '',
    a.session_date ?? '',
    a.session_start_time ?? '',
    a.checked_in_at ?? '',
    a.status,
    a.pass_id ?? '',
    nowIso(),
  ];
}

// ─── Sessions (A..M, 13 columns) ─────────────────────────────────────────
//
// A 세션ID | B 세션명 | C 유형 | D 일자 | E 시작시간 | F 종료시간
// G 장소 | H 정원 | I 예약수 | J 대기수 | K 상태 | L 실내여부 | M 최종동기화

export interface SessionLike {
  id: string;
  name: string;
  type: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  max_capacity?: number | null;
  current_reservations?: number | null;
  waitlist_count?: number | null;
  status?: string | null;
  is_indoor?: boolean | null;
}

export function mapSessionRow(s: SessionLike): SheetRow {
  return [
    s.id,
    s.name ?? '',
    s.type ?? '',
    s.date ?? '',
    s.start_time ?? '',
    s.end_time ?? '',
    s.location ?? '',
    s.max_capacity ?? '',
    s.current_reservations ?? 0,
    s.waitlist_count ?? 0,
    s.status ?? 'open',
    s.is_indoor ?? false,
    nowIso(),
  ];
}

// ─── AdminLog (A..I, 9 columns, append-only) ─────────────────────────────
//
// A 시각 | B 관리자ID | C 관리자이름 | D 행동 | E 대상유형
// F 대상ID | G 대상이름 | H 변경요약 | I IP

export interface AdminAuditLike {
  createdAt: string;
  adminId: string;
  adminName?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  summary?: string | null;
  ipAddress?: string | null;
}

export function mapAdminAuditRow(a: AdminAuditLike): SheetRow {
  return [
    a.createdAt,
    a.adminId,
    a.adminName ?? '',
    a.action,
    a.targetType ?? '',
    a.targetId ?? '',
    a.targetName ?? '',
    a.summary ?? '',
    a.ipAddress ?? '',
  ];
}
