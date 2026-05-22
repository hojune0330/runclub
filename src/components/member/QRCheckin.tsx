'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Camera, X, AlertCircle, Info, RefreshCw, UserCheck } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui';
import { sessionTypeConfig } from '@/lib/config';
import { format } from '@/lib/utils';
import { api } from '@/lib/api';

export default function QRCheckin() {
  const { sessions, reservations, memberPasses, currentMember, refreshReservations } = useApp();
  const toast = useToast();
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedSession, setScannedSession] = useState('');
  const [error, setError] = useState('');
  const [cameraSupported, setCameraSupported] = useState(true);
  const [detectorSupported, setDetectorSupported] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Today's reservations
  const todayReserved = reservations
    .filter(r => r.memberId === currentMember.id && r.status === 'reserved')
    .map(r => r.session || sessions.find(s => s.id === r.sessionId))
    .filter((s): s is NonNullable<typeof s> => !!s && s.date === today);

  const todayAttended = reservations
    .filter(r => r.memberId === currentMember.id && r.status === 'attended')
    .map(r => r.session || sessions.find(s => s.id === r.sessionId))
    .filter((s): s is NonNullable<typeof s> => !!s && s.date === today);

  const hasAnyActivePass = memberPasses.some(
    p => p.memberId === currentMember.id && p.status === 'active'
  );
  // Any pass usable for any session type
  const canCheckIn = todayReserved.length > 0; // must have today's reservation to check in

  // Detect browser support on mount
  useEffect(() => {
    // getUserMedia support
    if (typeof navigator !== 'undefined') {
      const mediaSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      setCameraSupported(mediaSupported);
    }
    // BarcodeDetector support
    if (typeof window !== 'undefined') {
      setDetectorSupported('BarcodeDetector' in window);
    }
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const startScanning = async () => {
    setError('');
    setScanned(false);

    if (detectorSupported === false) {
      setError('이 브라우저는 앱 내 QR 자동 스캔을 지원하지 않습니다. 휴대폰 기본 카메라로 QR을 열거나 코치에게 현장 출석 처리를 요청해주세요.');
      return;
    }

    setScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      if (detectorSupported) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const scanInterval = setInterval(async () => {
          if (!videoRef.current || !streamRef.current) {
            clearInterval(scanInterval);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              clearInterval(scanInterval);
              handleQRData(barcodes[0].rawValue);
            }
          } catch {
            // retry next tick
          }
        }, 300);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        setError(
          '카메라 권한이 거부되었습니다. 브라우저 주소창 좌측 자물쇠 아이콘 → "카메라 허용"으로 변경 후 새로고침해주세요.'
        );
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setError('연결된 카메라를 찾을 수 없습니다. 장치 연결을 확인해주세요.');
      } else if (e?.name === 'NotReadableError') {
        setError('카메라가 다른 앱에서 사용 중입니다. 다른 앱을 종료하고 다시 시도해주세요.');
      } else {
        setError('카메라에 접근할 수 없습니다. 브라우저 권한을 확인해주세요.');
      }
      setScanning(false);
    }
  };

  const parseQRCodePayload = (data: string): { sessionId: string; token: string } => {
    const raw = data.trim();
    try {
      const url = new URL(raw);
      const sessionId = url.searchParams.get('sessionId') || '';
      const token = url.searchParams.get('token') || '';
      if (sessionId && token) return { sessionId, token };
    } catch {
      // Not a URL; try legacy JSON below.
    }

    const parsed = JSON.parse(raw);
    if (!parsed.sessionId || !parsed.token) {
      throw new Error('QR 코드 형식이 올바르지 않습니다.');
    }
    return { sessionId: parsed.sessionId, token: parsed.token };
  };

  const handleQRData = async (data: string) => {
    stopCamera();
    try {
      const parsed = parseQRCodePayload(data);
      const result = await api.qr.verify(parsed.sessionId, parsed.token);
      setScannedSession(`${result.sessionName} · ${result.sessionTime}`);
      setScanned(true);
      setError('');
      await refreshReservations();
      setTimeout(() => setScanned(false), 4000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('예약')) {
        setError('이 세션에 예약이 없습니다. 먼저 세션을 예약해주세요.');
      } else if (msg.includes('만료') || msg.includes('유효')) {
        setError('QR 코드가 만료되었습니다. 코치에게 새 QR 코드를 요청 후 다시 스캔해주세요.');
      } else if (msg.includes('형식')) {
        setError('이 QR 코드는 체크인 QR이 아닙니다. 코치 화면의 QR을 스캔해주세요.');
      } else {
        setError(msg || 'QR 코드 인식에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">QR 체크인</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          세션 시작 60분 전부터 코치가 제시하는 QR 코드를 스캔하여 출석할 수 있습니다. 기본 카메라로 QR을 열어도 체크인됩니다.
        </p>
      </div>

      {/* Pre-flight notices */}
      {!hasAnyActivePass && (
        <div className="flex items-start gap-2.5 bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-md px-4 py-3">
          <AlertCircle size={16} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
          <div className="flex-1 text-[13px]">
            <p className="font-medium text-[var(--color-text)]">사용 가능한 수강권이 없습니다</p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              수강권이 있어야 세션을 예약하고 출석할 수 있습니다. 현장에서 코치에게 문의하거나 프로필의 "문의하기"를 이용해주세요.
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'passes' }))}
            className="shrink-0 text-[12px] font-medium text-[var(--color-warning)] hover:underline"
          >
            수강권 보기
          </button>
        </div>
      )}

      {hasAnyActivePass && !canCheckIn && (
        <div className="flex items-start gap-2.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-md px-4 py-3">
          <Info size={16} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
          <div className="flex-1 text-[13px]">
            <p className="font-medium text-[var(--color-text)]">오늘 예약된 세션이 없습니다</p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              QR 체크인을 하려면 먼저 해당 세션을 예약해야 합니다.
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'calendar' }))}
            className="shrink-0 inline-flex items-center justify-center min-h-9 px-3 text-[12.5px] font-medium text-[var(--color-primary)] hover:underline"
          >
            세션 일정
          </button>
        </div>
      )}

      {detectorSupported === false && (
        <div className="flex items-start gap-2.5 bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-md px-4 py-3">
          <AlertCircle size={16} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
          <div className="flex-1 text-[13px]">
            <p className="font-medium text-[var(--color-text)]">이 브라우저는 QR 자동 스캔을 지원하지 않습니다</p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              최신 Chrome/Edge/Samsung Internet을 사용하거나, 코치에게 수동 출석 처리를 요청해주세요.
            </p>
          </div>
        </div>
      )}

      {!cameraSupported && (
        <div className="flex items-start gap-2.5 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-md px-4 py-3">
          <AlertCircle size={16} className="text-[var(--color-danger)] shrink-0 mt-0.5" />
          <div className="flex-1 text-[13px]">
            <p className="font-medium text-[var(--color-text)]">카메라를 사용할 수 없는 환경입니다</p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              HTTPS 연결과 카메라가 장착된 기기에서 이용해주세요. 코치에게 직접 출석을 요청할 수도 있습니다.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Scanner panel */}
        <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">QR 스캐너</h2>
            {scanning && (
              <span className="text-[12px] text-[var(--color-primary)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                스캔 중
              </span>
            )}
          </div>

          <div className="p-6">
            <div className="w-full max-w-[320px] mx-auto aspect-square relative">
              {scanned ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--color-success-bg)] border border-[var(--color-success-border)] rounded-md">
                  <div className="w-14 h-14 rounded-full bg-[var(--color-success)] flex items-center justify-center">
                    <Check size={28} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div className="text-center px-2">
                    <p className="text-[15px] font-semibold text-[var(--color-success)]">출석 완료</p>
                    <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
                      {scannedSession}
                    </p>
                  </div>
                </div>
              ) : scanning ? (
                <div className="w-full h-full relative rounded-md overflow-hidden bg-black border border-[var(--color-border)]">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white" />
                  <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white" />
                  <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white" />
                  <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white" />
                  <button
                    onClick={stopCamera}
                    aria-label="스캔 중지"
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
                  >
                    <X size={14} />
                  </button>
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 py-2 text-center">
                    <p className="text-[12px] text-white">QR 코드를 화면에 맞추세요</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startScanning}
                  disabled={!cameraSupported || detectorSupported === false}
                  className="w-full h-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[var(--color-border-strong)] rounded-md bg-[var(--color-bg-subtle)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-bg)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[var(--color-border-strong)] disabled:hover:bg-[var(--color-bg-subtle)]"
                >
                  <div className="w-12 h-12 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center">
                    <Camera size={22} className="text-[var(--color-text-secondary)]" />
                  </div>
                  <div className="text-center px-2">
                    <p className="text-[14px] font-medium text-[var(--color-text)]">
                      클릭하여 스캔 시작
                    </p>
                    <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                      {canCheckIn
                        ? `오늘 ${todayReserved.length}개 예약 · 카메라로 코치 QR을 비춰주세요`
                        : '카메라로 코치 QR을 비춰주세요'}
                    </p>
                  </div>
                </button>
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 text-[13px] text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] px-3 py-2.5 rounded">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="leading-relaxed break-keep">{error}</p>
                  <button
                    onClick={() => {
                      setError('');
                      startScanning();
                    }}
                    disabled={!cameraSupported || detectorSupported === false}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  >
                    <RefreshCw size={11} />
                    다시 스캔
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Info / today's sessions panel */}
        <div className="space-y-6">
          <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)]">오늘 예약 / 출석</h2>
              <span className="text-[12px] text-[var(--color-text-muted)]">
                {todayReserved.length + todayAttended.length}건
              </span>
            </div>

            {todayReserved.length + todayAttended.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[13px] text-[var(--color-text-muted)]">
                  오늘 예정된 세션이 없습니다.
                </p>
                <button
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'calendar' }))
                  }
                  className="mt-2 inline-flex items-center justify-center gap-1 min-h-9 px-3 text-[12.5px] text-[var(--color-primary)] hover:underline"
                >
                  세션 일정 보기
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border-subtle)]">
                {todayReserved.map(session => {
                  if (!session) return null;
                  const config = sessionTypeConfig[session.type];
                  return (
                    <li key={session.id} className="px-4 py-3 flex items-center gap-3">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: config.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[var(--color-text)] font-medium truncate">
                          {session.name}
                        </p>
                        <p className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          {session.startTime}
                          {session.location ? ` · ${session.location}` : ''}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--color-primary-bg)] text-[var(--color-primary)] border border-[var(--color-primary-border)]">
                        예약됨
                      </span>
                    </li>
                  );
                })}
                {todayAttended.map(session => {
                  if (!session) return null;
                  const config = sessionTypeConfig[session.type];
                  return (
                    <li key={session.id + '-att'} className="px-4 py-3 flex items-center gap-3">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: config.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[var(--color-text-muted)] line-through truncate">
                          {session.name}
                        </p>
                        <p className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          {session.startTime}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] inline-flex items-center gap-1">
                        <Check size={10} />
                        출석 완료
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)]">체크인 안내</h2>
            </div>
            <ol className="px-4 py-3 space-y-2">
              {[
                '세션 시작 60분 전부터 종료 60분 후까지 체크인 가능합니다.',
                '앱 내 스캐너 또는 휴대폰 기본 카메라로 코치 QR을 엽니다.',
                'QR은 30초마다 새로 표시되지만, 스캔 실패를 줄이기 위해 2분간 유효합니다.',
                '스캔이 어려운 경우 코치의 현장 태블릿에서 이름/연락처로 출석할 수 있습니다.',
              ].map((text, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-[13px] text-[var(--color-text-secondary)]"
                >
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-bg-hover)] text-[11px] font-medium text-[var(--color-text-secondary)] flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 leading-relaxed pt-0.5">{text}</span>
                </li>
              ))}
            </ol>
            <div className="px-4 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]">
              <button
                onClick={() =>
                  toast.info(
                    '코치에게 수동 출석을 요청하세요',
                    '현장에서 코치가 관리자 페이지에서 직접 출석 처리를 해드릴 수 있습니다.'
                  )
                }
                className="h-9 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] active:bg-[var(--color-bg-hover)] rounded px-2 -mx-2"
              >
                <UserCheck size={13} />
                코치에게 수동 출석 요청
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
