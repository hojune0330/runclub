// ─── Static configuration objects (not data, just display configs) ───

export const sessionTypeConfig = {
  ebw: { label: 'EBW', color: '#f97316', bgColor: '#fff7ed', textColor: '#c2410c' },
  slowrun: { label: '런클럽', color: '#3b82f6', bgColor: '#eff6ff', textColor: '#1d4ed8' },
  marathon: { label: '러닝클래스', color: '#10b981', bgColor: '#ecfdf5', textColor: '#065f46' },
} as const;

export const reservationStatusConfig = {
  reserved: { label: '예약완료', color: '#3b82f6', bgColor: '#eff6ff' },
  attended: { label: '출석', color: '#10b981', bgColor: '#ecfdf5' },
  noshow: { label: '노쇼', color: '#ef4444', bgColor: '#fef2f2' },
  cancelled: { label: '취소', color: '#6b7280', bgColor: '#f9fafb' },
} as const;

export const passStatusConfig = {
  active: { label: '사용중', color: '#10b981', bgColor: '#ecfdf5' },
  expired: { label: '만료', color: '#6b7280', bgColor: '#f9fafb' },
  paused: { label: '정지', color: '#f59e0b', bgColor: '#fffbeb' },
  refunded: { label: '환불', color: '#ef4444', bgColor: '#fef2f2' },
} as const;
