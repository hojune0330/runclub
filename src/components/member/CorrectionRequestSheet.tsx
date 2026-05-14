'use client';

// ─── CorrectionRequestSheet ───────────────────────────────────────────────
//
// 회원이 자신의 예약 1건에 대해 정정 요청을 보내는 모달 시트.
//
// 정책 요약 (서버: /api/correction-requests, 동기화 필수)
//  - 세션 시작으로부터 48h 이내에만 작성 가능 (서버에서도 재검증)
//  - reasonCode 5종 + 자유 텍스트 detail(선택)
//  - 같은 예약에 pending 인 요청이 1건 있으면 추가 불가
//  - 10분에 5건 rate limit (서버 단)
//
// 운영적으로 가장 중요한 건 "회원이 채널 바꾸지 않고 셀프 서비스로 해결"
// 이므로, UI 는 라벨/예시를 최대한 친절하게 노출해서 관리자에게 다시
// 묻는 라운드트립을 줄이는 데 초점.

import { useState, useMemo } from 'react';
import { X, MessageSquareWarning, AlertCircle } from 'lucide-react';
import { Modal, FormField, useToast } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { reservationStatusConfig, sessionTypeConfig } from '@/lib/config';
import { formatKoreanDate, cn } from '@/lib/utils';
import type { Reservation, Session } from '@/types';

// 서버의 REASON_CODES 와 같은 순서·키 (변경 시 양쪽 동시에)
type ReasonCode =
  | 'attended_marked_noshow'
  | 'noshow_marked_attended'
  | 'want_cancel'
  | 'swapped_with_other'
  | 'other';

const REASON_OPTIONS: {
  code: ReasonCode;
  label: string;
  hint: string;
  // 회원이 이 사유를 선택할 수 있는 "현재 상태" 화이트리스트.
  // 예: '출석했는데 노쇼 처리됨'은 현재 상태가 noshow 일 때만 의미가 있다.
  validForStatus?: Reservation['status'][];
}[] = [
  {
    code: 'attended_marked_noshow',
    label: '출석했는데 노쇼로 처리됐어요',
    hint: '정상 참석했지만 출석 체크가 누락된 경우',
    validForStatus: ['noshow'],
  },
  {
    code: 'noshow_marked_attended',
    label: '안 갔는데 출석으로 처리됐어요',
    hint: '실제로 참석하지 않았지만 출석으로 표시된 경우',
    validForStatus: ['attended'],
  },
  {
    code: 'want_cancel',
    label: '예약을 취소하고 싶었어요',
    hint: '예약 취소 마감이 지나 직접 취소하지 못한 경우',
    validForStatus: ['reserved', 'attended', 'noshow'],
  },
  {
    code: 'swapped_with_other',
    label: '다른 분과 처리가 바뀐 것 같아요',
    hint: '동명이인 등으로 결과가 뒤바뀐 경우 — 관리자 확인 필요',
  },
  {
    code: 'other',
    label: '기타',
    hint: '위 항목에 해당하지 않는 경우 — 아래 상세 내용을 꼭 적어주세요',
  },
];

const CORRECTION_WINDOW_HOURS = 48;

interface Props {
  reservation: Reservation;
  session: Session;
  onClose: () => void;
}

export default function CorrectionRequestSheet({ reservation, session, onClose }: Props) {
  const { createCorrectionRequest } = useApp();
  const toast = useToast();

  // 현재 예약 상태와 맞물리는 사유를 위로 — 처음 클릭이 자연스럽도록
  const orderedReasons = useMemo(() => {
    return [...REASON_OPTIONS].sort((a, b) => {
      const aMatch = a.validForStatus?.includes(reservation.status) ? 0 : 1;
      const bMatch = b.validForStatus?.includes(reservation.status) ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [reservation.status]);

  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 마감까지 남은 시간 — 회원이 "안 늦었는지" 한눈에 보게
  const remainingHours = useMemo(() => {
    const t = new Date(`${session.date}T${session.startTime || '00:00'}:00`).getTime();
    if (Number.isNaN(t)) return 0;
    const deadline = t + CORRECTION_WINDOW_HOURS * 3600_000;
    return Math.max(0, Math.floor((deadline - Date.now()) / 3600_000));
  }, [session.date, session.startTime]);

  const handleSubmit = async () => {
    setError(null);
    if (!reasonCode) {
      setError('사유를 선택해주세요.');
      return;
    }
    // "기타"는 detail 필수 — 관리자가 다시 묻는 라운드트립 방지
    if (reasonCode === 'other' && !detail.trim()) {
      setError('"기타"를 선택한 경우 상세 내용을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const ok = await createCorrectionRequest({
        reservationId: reservation.id,
        reasonCode,
        detail: detail.trim() || undefined,
      });
      if (ok) {
        toast.success('정정 요청을 보냈습니다', '관리자가 확인 후 처리합니다 (보통 1~2일 이내)');
        onClose();
      } else {
        setError('요청 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (e: any) {
      setError(e?.message || '요청 전송에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const typeConf = sessionTypeConfig[session.type];
  const statusConf = reservationStatusConfig[reservation.status];

  return (
    <Modal title="정정 요청 보내기" onClose={onClose}>
      <div className="space-y-4">
        {/* 대상 세션 요약 — 무엇을 정정하는지 명확하게 */}
        <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded px-3 py-2.5">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ backgroundColor: typeConf.bgColor, color: typeConf.textColor }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeConf.color }} />
              {typeConf.label}
            </span>
            <span className="text-[13px] font-semibold text-[var(--color-text)]">{session.name}</span>
          </div>
          <p className="text-[12px] text-[var(--color-text-secondary)] tabular-nums">
            {formatKoreanDate(session.date, 'M월 d일 (EEE)')} · {session.startTime}
            {session.location && ` · ${session.location}`}
          </p>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
            현재 상태:{' '}
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
            >
              {statusConf.label}
            </span>
          </p>
        </div>

        {/* SLA 안내 — 너무 큰 글씨로 압박하지 않되, "마감" 임을 인지시킨다 */}
        <div className="text-[12px] text-[var(--color-primary)] bg-[var(--color-primary-bg)] border border-[var(--color-primary)]/30 rounded px-3 py-2 inline-flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            정정 요청은 <b>세션 시작 후 {CORRECTION_WINDOW_HOURS}시간 이내</b>까지 받습니다
            {remainingHours > 0 && ` (남은 시간 약 ${remainingHours}시간)`}.
            <br />
            그 이후에는 오픈채팅 또는 문의로 연락 부탁드려요.
          </span>
        </div>

        {/* 사유 선택 (라디오 리스트) */}
        <FormField label="어떤 점이 문제였나요?" required>
          <ul className="space-y-1.5">
            {orderedReasons.map(opt => {
              const matches = opt.validForStatus?.includes(reservation.status);
              const isActive = reasonCode === opt.code;
              return (
                <li key={opt.code}>
                  <button
                    type="button"
                    onClick={() => setReasonCode(opt.code)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded border transition-colors',
                      isActive
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-white',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors',
                          isActive
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                            : 'border-[var(--color-border-strong)] bg-white',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-medium text-[var(--color-text)]">
                            {opt.label}
                          </span>
                          {matches && (
                            <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] font-medium">
                              현재 상태와 일치
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                          {opt.hint}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </FormField>

        {/* 상세 내용 — "기타"일 때 필수, 그 외엔 선택 */}
        <FormField
          label={
            reasonCode === 'other'
              ? '상세 내용 (필수)'
              : '상세 내용 (선택)'
          }
          hint={`${detail.length} / 500`}
        >
          <textarea
            className="form-input min-h-[80px] resize-y"
            rows={3}
            maxLength={500}
            value={detail}
            onChange={e => setDetail(e.target.value)}
            placeholder={
              reasonCode === 'swapped_with_other'
                ? '예: 동명이인 김OO과 결과가 바뀐 것 같습니다.'
                : reasonCode === 'other'
                  ? '예: 출석은 했는데 19시 세션이 아닌 20시 세션이었습니다.'
                  : '관리자가 빠르게 확인할 수 있도록 추가로 알려주실 내용이 있다면 적어주세요.'
            }
          />
        </FormField>

        {error && (
          <div className="text-[12.5px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded px-3 py-2 inline-flex items-start gap-2">
            <X size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !reasonCode}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[13px] text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50"
          >
            <MessageSquareWarning size={14} />
            {busy ? '전송 중…' : '정정 요청 보내기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
