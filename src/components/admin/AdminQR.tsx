'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, MapPin, QrCode, RefreshCw, UserCheck } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { formatKoreanDate, cn, format } from '@/lib/utils';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui';
import type { Reservation, Session } from '@/types';

const QR_REFRESH_SEC = 30;

type Mode = 'tablet' | 'qr';
type RecentCheckin = {
  id: string;
  memberName: string;
  phone: string;
  message: string;
  source: string;
  checkedInAt: string;
  passDelta: number;
};

export default function AdminQR() {
  const { sessions, reservations, refreshReservations, refreshSessions, refreshPasses } = useApp();
  const today = format(new Date(), 'yyyy-MM-dd');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const todaySessions = useMemo(
    () => sessions.filter(s => s.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [sessions, today]
  );
  const upcomingSessions = useMemo(
    () => sessions.filter(s => s.date > today).sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
    }).slice(0, 8),
    [sessions, today]
  );

  const [selectedSession, setSelectedSession] = useState<Session | null>(todaySessions[0] || null);
  const [mode, setMode] = useState<Mode>('tablet');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [checkinUrl, setCheckinUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(QR_REFRESH_SEC);
  const [generating, setGenerating] = useState(false);
  const [qrError, setQrError] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [allowWalkIn, setAllowWalkIn] = useState(true);
  const [skipPass, setSkipPass] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinError, setCheckinError] = useState('');
  const [checkinSuccess, setCheckinSuccess] = useState('');
  const [recent, setRecent] = useState<RecentCheckin[]>([]);

  const sessionReservations = useMemo(
    () => selectedSession
      ? reservations.filter((r: Reservation) => r.sessionId === selectedSession.id)
      : [],
    [reservations, selectedSession]
  );
  const reservedCount = sessionReservations.filter(r => r.status === 'reserved').length;
  const attendedCount = sessionReservations.filter(r => r.status === 'attended').length;
  const inactiveCount = sessionReservations.filter(r => r.status === 'cancelled' || r.status === 'noshow').length;

  // Sync selected when today's sessions load
  useEffect(() => {
    if (!selectedSession && todaySessions.length > 0) {
      setSelectedSession(todaySessions[0]);
    }
  }, [todaySessions, selectedSession]);

  useEffect(() => {
    setQrDataUrl('');
    setCheckinUrl('');
    setQrError('');
    setCheckinError('');
    setCheckinSuccess('');
  }, [selectedSession?.id]);

  const generateQR = useCallback(async () => {
    if (!selectedSession) return;
    setGenerating(true);
    setQrError('');
    try {
      const result = await api.qr.generate(selectedSession.id);
      setQrDataUrl(result.qrDataUrl);
      setCheckinUrl(result.checkinUrl || '');
      setTimeLeft(QR_REFRESH_SEC);
    } catch (e: any) {
      const message = e?.message || 'QR 생성에 실패했습니다.';
      setQrError(message);
      console.error('QR generation failed:', e);
    }
    setGenerating(false);
  }, [selectedSession]);

  useEffect(() => {
    if (selectedSession && mode === 'qr') generateQR();
  }, [selectedSession, mode, generateQR]);

  useEffect(() => {
    if (!selectedSession || !qrDataUrl || mode !== 'qr') return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          generateQR();
          return QR_REFRESH_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedSession, qrDataUrl, mode, generateQR]);

  const handleFieldCheckin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSession || checkingIn) return;

    setCheckingIn(true);
    setCheckinError('');
    setCheckinSuccess('');

    try {
      const result = await api.attendance.fieldCheckIn({
        sessionId: selectedSession.id,
        name,
        phone,
        allowWalkIn,
        skipPass,
      });
      const successMessage = `${result.member.name}님 ${result.message}`;
      setCheckinSuccess(successMessage);
      setRecent(prev => [{
        id: `${result.reservationId}-${Date.now()}`,
        memberName: result.member.name,
        phone: result.member.phone,
        message: result.message,
        source: result.source,
        checkedInAt: result.checkedInAt,
        passDelta: result.passDelta,
      }, ...prev].slice(0, 8));
      setName('');
      setPhone('');
      await Promise.all([refreshReservations(), refreshSessions(), refreshPasses()]);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    } catch (e: any) {
      setCheckinError(e?.message || '출석 처리에 실패했습니다.');
    } finally {
      setCheckingIn(false);
    }
  };

  const fieldCheckinForm = (context: Mode) => (
    <form onSubmit={handleFieldCheckin} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4 sm:p-5 space-y-4">
      <div className="text-center">
        <h2 className="text-[20px] font-bold text-[var(--color-text)]">
          {context === 'qr' ? 'QR이 안 되면 이름으로 바로 출석' : '이름만 입력하면 출석돼요'}
        </h2>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
          {context === 'qr'
            ? '수강권이 없거나 구매 연동 전이어도 담당자 확인 후 현장에서 바로 처리할 수 있습니다.'
            : '예약자 · 현장 참가자 모두 즉시 출석됩니다. 같은 이름이 여러 명일 때만 연락처를 함께 입력하세요.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">이름</span>
          <input
            ref={nameInputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            placeholder="홍길동"
            className="w-full h-14 rounded-lg border border-[var(--color-border)] bg-white px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">연락처 <span className="text-[var(--color-text-muted)] font-normal">(선택 · 동명이인일 때만)</span></span>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="동명이인일 때만 입력 (예: 5678)"
            className="w-full h-14 rounded-lg border border-[var(--color-border)] bg-white px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
          />
        </label>
      </div>

      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-3 space-y-2">
        <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">현장 처리 옵션</p>
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={allowWalkIn}
            onChange={e => setAllowWalkIn(e.target.checked)}
            className="mt-0.5"
          />
          <span>예약 없는 참가자도 현장 추가 <span className="text-[var(--color-text-muted)]">(수강권 있으면 자동 차감 · 신규/당일 참가 권장)</span></span>
        </label>
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={skipPass}
            onChange={e => setSkipPass(e.target.checked)}
            className="mt-0.5"
          />
          <span>수강권 확인 전 예외 출석 <span className="text-[var(--color-text-muted)]">(구매 연동 전 · 신규 체험 · 담당자 확인)</span></span>
        </label>
      </div>

      {checkinError && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] px-3 py-2.5 text-[13px] text-[var(--color-danger)]">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <p>{checkinError}</p>
        </div>
      )}
      {checkinSuccess && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)] px-3 py-2.5 text-[13px] text-[var(--color-success)]">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <p>{checkinSuccess}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={checkingIn || !name.trim()}
        className="w-full h-14 rounded-lg bg-[var(--color-primary)] text-white text-[16px] font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {checkingIn ? <RefreshCw size={18} className="animate-spin" /> : <UserCheck size={18} />}
        바로 출석 처리
      </button>
    </form>
  );

  return (
    <div className="max-w-[1400px] space-y-5">
      <div>
        <h1 className="page-title">출석 체크</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          QR 체크인 중 막히는 참가자도 같은 화면에서 이름/연락처로 바로 현장 출석 처리할 수 있습니다. 수강권 구매 연동 전인 경우에는 담당자 확인 후 예외 출석으로 남겨두세요.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* Session list */}
        <div className="col-span-2 space-y-4">
          <Panel title="오늘의 세션" action={`${todaySessions.length}개`}>
            {todaySessions.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">
                오늘 예정된 세션이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {todaySessions.map(s => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    selected={selectedSession?.id === s.id}
                    onClick={() => setSelectedSession(s)}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="다가오는 세션" action={`${upcomingSessions.length}개`}>
            {upcomingSessions.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">
                예정된 세션이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)] max-h-[300px] overflow-y-auto">
                {upcomingSessions.map(s => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    selected={selectedSession?.id === s.id}
                    onClick={() => setSelectedSession(s)}
                    showDate
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Check-in viewport */}
        <div className="col-span-3 space-y-4">
          <div className="bg-white border border-[var(--color-border)] rounded-md p-1 flex gap-1">
            <button
              onClick={() => setMode('tablet')}
              className={cn(
                'flex-1 h-10 rounded text-[13px] font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                mode === 'tablet'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              )}
            >
              <UserCheck size={14} />
              현장 태블릿 체크인
            </button>
            <button
              onClick={() => setMode('qr')}
              className={cn(
                'flex-1 h-10 rounded text-[13px] font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                mode === 'qr'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              )}
            >
              <QrCode size={14} />
              QR 체크인
            </button>
          </div>

          {mode === 'tablet' ? (
            <Panel title="현장 태블릿 체크인" action={selectedSession ? `${attendedCount}명 출석` : undefined}>
              {selectedSession ? (
                <div className="p-5 space-y-5">
                  <SessionHeader session={selectedSession} />

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatusStat label="예약 대기" value={reservedCount} tone="primary" />
                    <StatusStat label="출석 완료" value={attendedCount} tone="success" />
                    <StatusStat label="취소/노쇼" value={inactiveCount} tone="muted" />
                  </div>

                  {fieldCheckinForm('tablet')}

                  <RecentCheckins items={recent} />
                </div>
              ) : (
                <EmptySelection icon="user" />
              )}
            </Panel>
          ) : (
            <Panel title="QR 코드 + 현장 수기 출석" action={selectedSession ? `화면 갱신 ${timeLeft}초` : undefined}>
              {selectedSession ? (
                <div className="p-5 space-y-5">
                  <SessionHeader session={selectedSession} />

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatusStat label="예약 대기" value={reservedCount} tone="primary" />
                    <StatusStat label="출석 완료" value={attendedCount} tone="success" />
                    <StatusStat label="취소/노쇼" value={inactiveCount} tone="muted" />
                  </div>

                  <div className="rounded-lg border border-[var(--color-primary-border)] bg-[var(--color-primary-bg)]/40 px-4 py-3 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                    QR로 막히면 참가자를 돌려보내지 말고 아래 이름/연락처 입력으로 바로 처리하세요. 수강권 구매는 했지만 아직 연동되지 않은 경우 <span className="font-semibold text-[var(--color-text)]">수강권 확인 전 예외 출석</span>을 체크해 출석 기록을 남길 수 있습니다.
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,360px)_1fr] gap-5 items-start">
                    <div className="flex flex-col items-center rounded-xl border border-[var(--color-border)] bg-white p-4">
                      <div className="bg-white border border-[var(--color-border)] rounded p-4 mb-4">
                        {qrDataUrl ? (
                          <img src={qrDataUrl} alt="QR Code" className="w-[260px] h-[260px]" />
                        ) : (
                          <div className="w-[260px] h-[260px] flex items-center justify-center">
                            {generating ? (
                              <div className="w-6 h-6 border-2 border-[var(--color-border-strong)] border-t-[var(--color-primary)] rounded-full animate-spin" />
                            ) : (
                              <QrCode size={48} className="text-[var(--color-border-strong)]" />
                            )}
                          </div>
                        )}
                      </div>

                      {qrError && (
                        <div className="w-full max-w-[360px] mb-4 flex items-start gap-2 rounded bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] px-3 py-2 text-[13px] text-[var(--color-danger)]">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <p>{qrError}</p>
                        </div>
                      )}

                      <div className="w-full max-w-[300px] mb-3">
                        <div className="h-1 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded transition-all duration-1000 ease-linear',
                              timeLeft <= 5 ? 'bg-[var(--color-danger)]' : timeLeft <= 10 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-primary)]'
                            )}
                            style={{ width: `${(timeLeft / QR_REFRESH_SEC) * 100}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 gap-3">
                          <span className="text-[12px] text-[var(--color-text-muted)]">QR은 2분 유효 · 실패하면 오른쪽에서 수기 출석</span>
                          <span className={cn('text-[13px] tabular-nums font-medium', timeLeft <= 5 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]')}>
                            {timeLeft}초
                          </span>
                        </div>
                      </div>

                      {checkinUrl && (
                        <p className="max-w-[320px] text-center text-[12px] text-[var(--color-text-muted)] break-all mb-3">
                          기본 카메라로 열리는 체크인 링크: {checkinUrl}
                        </p>
                      )}

                      <button
                        onClick={generateQR}
                        disabled={generating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                        즉시 갱신
                      </button>
                    </div>

                    <div className="space-y-4">
                      {fieldCheckinForm('qr')}
                      <RecentCheckins items={recent} />
                    </div>
                  </div>
                </div>
              ) : (
                <EmptySelection icon="qr" />
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionHeader({ session }: { session: Session }) {
  return (
    <div className="text-center mb-2">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
          style={{ backgroundColor: sessionTypeConfig[session.type].bgColor, color: sessionTypeConfig[session.type].textColor }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sessionTypeConfig[session.type].color }} />
          {sessionTypeConfig[session.type].label}
        </span>
      </div>
      <h2 className="text-[18px] font-semibold text-[var(--color-text)] mb-1">{session.name}</h2>
      <p className="text-[13px] text-[var(--color-text-secondary)] tabular-nums">
        {formatKoreanDate(session.date, 'yyyy년 M월 d일 (EEE)')} · {session.startTime}
      </p>
      {session.location && (
        <p className="text-[12px] text-[var(--color-text-muted)] mt-1">{session.location}</p>
      )}
    </div>
  );
}

function StatusStat({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' | 'muted' }) {
  const cls = tone === 'primary'
    ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)] border-[var(--color-primary-border)]'
    : tone === 'success'
      ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]'
      : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]';
  return (
    <div className={cn('rounded-lg border px-3 py-2', cls)}>
      <p className="text-[11px] font-medium">{label}</p>
      <p className="text-[22px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function RecentCheckins({ items }: { items: RecentCheckin[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] py-6 text-center text-[13px] text-[var(--color-text-muted)]">
        아직 이 화면에서 처리한 출석이 없습니다.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] text-[13px] font-semibold text-[var(--color-text)]">
        방금 처리한 출석
      </div>
      <ul className="divide-y divide-[var(--color-border-subtle)]">
        {items.map(item => (
          <li key={item.id} className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--color-text)] truncate">{item.memberName}</p>
              <p className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                {new Date(item.checkedInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                {item.passDelta < 0 ? ' · 수강권 1회 차감' : ''}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
              <CheckCircle2 size={10} />
              완료
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptySelection({ icon }: { icon: 'user' | 'qr' }) {
  const Icon = icon === 'qr' ? QrCode : UserCheck;
  return (
    <div className="py-20 text-center">
      <Icon size={48} className="text-[var(--color-border-strong)] mx-auto mb-3" />
      <p className="text-[13px] text-[var(--color-text-muted)]">좌측에서 세션을 선택하세요.</p>
    </div>
  );
}

function SessionItem({ session, selected, onClick, showDate }: { session: Session; selected: boolean; onClick: () => void; showDate?: boolean }) {
  const config = sessionTypeConfig[session.type];
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
          selected ? 'bg-[var(--color-primary-bg)]' : 'hover:bg-[var(--color-bg-subtle)]'
        )}
      >
        <span className="w-1 h-10 rounded shrink-0" style={{ backgroundColor: config.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn('text-[13px] font-medium truncate', selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]')}>
              {session.name}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock size={10} />
              {showDate ? `${formatKoreanDate(session.date, 'M.d')} ${session.startTime}` : session.startTime}
            </span>
            {session.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin size={10} />
                {session.location}
              </span>
            )}
          </div>
        </div>
        <span className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums shrink-0">
          {session.currentReservations}/{session.maxCapacity}
        </span>
      </button>
    </li>
  );
}
