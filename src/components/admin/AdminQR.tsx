'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { QrCode, RefreshCw, Clock, MapPin } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { sessionTypeConfig } from '@/lib/config';
import { formatKoreanDate, cn, format } from '@/lib/utils';
import { api } from '@/lib/api';
import { Panel } from '@/components/ui';
import type { Session } from '@/types';

export default function AdminQR() {
  const { sessions } = useApp();
  const today = format(new Date(), 'yyyy-MM-dd');
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
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [generating, setGenerating] = useState(false);

  // Sync selected when today's sessions load
  useEffect(() => {
    if (!selectedSession && todaySessions.length > 0) {
      setSelectedSession(todaySessions[0]);
    }
  }, [todaySessions, selectedSession]);

  const generateQR = useCallback(async () => {
    if (!selectedSession) return;
    setGenerating(true);
    try {
      const result = await api.qr.generate(selectedSession.id);
      setQrDataUrl(result.qrDataUrl);
      setTimeLeft(30);
    } catch (e) {
      console.error('QR generation failed:', e);
    }
    setGenerating(false);
  }, [selectedSession]);

  useEffect(() => {
    if (selectedSession) generateQR();
  }, [selectedSession, generateQR]);

  useEffect(() => {
    if (!selectedSession || !qrDataUrl) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          generateQR();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedSession, qrDataUrl, generateQR]);

  return (
    <div className="max-w-[1400px] space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">출석 QR 생성</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          세션별로 QR 코드를 표시합니다. 코드는 30초마다 자동 갱신되며, 회원이 카메라로 스캔하여 출석 체크합니다.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4">
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

        {/* QR viewport */}
        <div className="col-span-3">
          <Panel title="QR 코드" action={selectedSession ? `자동 갱신 ${timeLeft}초` : undefined}>
            {selectedSession ? (
              <div className="p-8 flex flex-col items-center">
                {/* Session info */}
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium"
                      style={{ backgroundColor: sessionTypeConfig[selectedSession.type].bgColor, color: sessionTypeConfig[selectedSession.type].textColor }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sessionTypeConfig[selectedSession.type].color }} />
                      {sessionTypeConfig[selectedSession.type].label}
                    </span>
                  </div>
                  <h2 className="text-[18px] font-semibold text-[var(--color-text)] mb-1">{selectedSession.name}</h2>
                  <p className="text-[13px] text-[var(--color-text-secondary)] tabular-nums">
                    {formatKoreanDate(selectedSession.date, 'yyyy년 M월 d일 (EEE)')} · {selectedSession.startTime}
                  </p>
                  {selectedSession.location && (
                    <p className="text-[12px] text-[var(--color-text-muted)] mt-1">{selectedSession.location}</p>
                  )}
                </div>

                {/* QR */}
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

                {/* Timer */}
                <div className="w-full max-w-[260px] mb-3">
                  <div className="h-1 bg-[var(--color-bg-hover)] rounded overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded transition-all duration-1000 ease-linear",
                        timeLeft <= 5 ? "bg-[var(--color-danger)]" : timeLeft <= 10 ? "bg-[var(--color-warning)]" : "bg-[var(--color-primary)]"
                      )}
                      style={{ width: `${(timeLeft / 30) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[12px] text-[var(--color-text-muted)]">30초마다 자동 갱신</span>
                    <span className={cn("text-[13px] tabular-nums font-medium", timeLeft <= 5 ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]")}>
                      {timeLeft}초 남음
                    </span>
                  </div>
                </div>

                <button
                  onClick={generateQR}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                  즉시 갱신
                </button>
              </div>
            ) : (
              <div className="py-20 text-center">
                <QrCode size={48} className="text-[var(--color-border-strong)] mx-auto mb-3" />
                <p className="text-[13px] text-[var(--color-text-muted)]">좌측에서 세션을 선택하세요.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>
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
          "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors",
          selected ? "bg-[var(--color-primary-bg)]" : "hover:bg-[var(--color-bg-subtle)]"
        )}
      >
        <span className="w-1 h-10 rounded shrink-0" style={{ backgroundColor: config.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn("text-[13px] font-medium truncate", selected ? "text-[var(--color-primary)]" : "text-[var(--color-text)]")}>
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
