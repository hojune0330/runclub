'use client';

import { useState, useMemo } from 'react';
import { Clock, MapPin, CalendarDays, ArrowRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig, reservationStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn } from '@/lib/utils';

type Tab = 'upcoming' | 'past';

export default function MyReservations() {
  const { reservations, sessions, currentMember, cancelReservation } = useApp();
  const [tab, setTab] = useState<Tab>('upcoming');

  const today = new Date().toISOString().split('T')[0];

  const myReservations = useMemo(() => {
    return reservations
      .filter(r => r.memberId === currentMember.id)
      .map(r => ({
        ...r,
        session: r.session || sessions.find(s => s.id === r.sessionId),
      }));
  }, [reservations, sessions, currentMember.id]);

  const upcoming = myReservations
    .filter(r => r.session && r.session.date >= today && r.status === 'reserved')
    .sort((a, b) => (a.session?.date || '').localeCompare(b.session?.date || ''));
  const past = myReservations
    .filter(r => r.session && (r.session.date < today || r.status !== 'reserved'))
    .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));

  const items = tab === 'upcoming' ? upcoming : past;

  const handleCancel = async (reservationId: string) => {
    if (confirm('예약을 취소하시겠습니까?')) {
      await cancelReservation(reservationId);
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">내 예약</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          다가오는 예약 {upcoming.length}건 · 지난 예약 {past.length}건
        </p>
      </div>

      {/* Panel */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-[var(--color-border)] px-4">
          {(
            [
              { id: 'upcoming' as Tab, label: '다가오는 예약', count: upcoming.length },
              { id: 'past' as Tab, label: '지난 예약', count: past.length },
            ]
          ).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'text-[13px] py-2.5 px-3 -mb-px border-b-2 transition-colors inline-flex items-center gap-1.5',
                tab === t.id
                  ? 'border-[var(--color-primary)] text-[var(--color-text)] font-medium'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'text-[11px] px-1.5 py-0 rounded-full tabular-nums',
                  tab === t.id
                    ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                    : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
              <CalendarDays size={18} className="text-[var(--color-text-muted)]" />
            </div>
            <p className="text-[13.5px] text-[var(--color-text)] font-medium mb-1">
              {tab === 'upcoming' ? '다가오는 예약이 없어요' : '지난 예약이 없어요'}
            </p>
            <p className="text-[12.5px] text-[var(--color-text-muted)] mb-4">
              {tab === 'upcoming'
                ? '세션 일정에서 원하는 세션을 선택해 예약해 보세요.'
                : '참여한 세션이 쌓이면 여기에 기록이 남아요.'}
            </p>
            {tab === 'upcoming' && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'calendar' }))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded transition-colors"
              >
                세션 일정 보기
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="scroll-x">
          <table className="responsive-table" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">날짜</th>
                <th className="text-left font-medium px-4 py-2.5 w-[80px]">시간</th>
                <th className="text-left font-medium px-4 py-2.5 w-[120px]">유형</th>
                <th className="text-left font-medium px-4 py-2.5">세션명</th>
                <th className="text-left font-medium px-4 py-2.5 w-[160px]">장소</th>
                <th className="text-left font-medium px-4 py-2.5 w-[100px]">상태</th>
                <th className="text-right font-medium px-4 py-2.5 w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => {
                const session = r.session;
                if (!session) return null;
                const config = sessionTypeConfig[session.type];
                const statusConf = reservationStatusConfig[r.status];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-text)] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-[var(--color-text-muted)]" />
                        {formatKoreanDate(session.date, 'M월 d일 (EEE)')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-[var(--color-text-muted)]" />
                        {session.startTime}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
                        style={{ backgroundColor: config.bgColor, color: config.textColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)] font-medium">{session.name}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {session.location ? (
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-[var(--color-text-muted)]" />
                          {session.location}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium"
                        style={{ backgroundColor: statusConf.bgColor, color: statusConf.color }}
                      >
                        {statusConf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tab === 'upcoming' && r.status === 'reserved' && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          className="text-[12px] px-2.5 py-1 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger-border)] transition-colors"
                        >
                          예약 취소
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
