'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Camera, X, AlertCircle, Info, RefreshCw, UserCheck, Phone, Copy, ChevronDown } from 'lucide-react';
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
  const [showFallback, setShowFallback] = useState(false);
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
  // 만료/정지된 수강권만 있는 경우 — "신규"가 아니라 "기존 회원이지만 만료"로 안내한다.
  const hasOnlyInactivePass =
    !hasAnyActivePass &&
    memberPasses.some(p => p.memberId === currentMember.id && p.status !== 'active');

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
      setError('이 브라우저는 앱 내 QR 자동 스캔을 지원하지 않습니다. 휴대폰 기본 카메라로 QR을 열거나, 아래 "현장 체크인이 안 되나요?"를 눌러주세요.');
      setShowFallback(true);
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
          '카메라 권한이 거부되었습니다. 브라우저 주소창 좌측 자물쇠 아이콘 → "카메라 허용"으로 변경 후 새로고침해주세요. 급하면 아래 현장 체크인 방법을 이용하세요.'
        );
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setError('연결된 카메라를 찾을 수 없습니다. 휴대폰 기본 카메라로 QR을 열거나 아래 현장 체크인 방법을 이용하세요.');
      } else if (e?.name === 'NotReadableError') {
        setError('카메라가 다른 앱에서 사용 중입니다. 다른 앱을 종료하고 다시 시도하거나, 아래 현장 체크인 방법을 이용하세요.');
      } else {
        setError('카메라에 접근할 수 없습니다. 아래 "현장 체크인이 안 되나요?"를 이용하세요.');
      }
      setShowFallback(true);
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
      setShowFallback(false);
      await refreshReservations();
      setTimeout(() => setScanned(false), 4000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      const msg = e?.message || '';
      // 어떤 실패든 현장 대안(코치 출석)을 함께 노출해서 막다른 길을 없앤다.
      setShowFallback(true);
      if (msg.includes('수강권')) {
        setError('예약이 없고 이 세션에 사용할 수 있는 수강권도 없어요. 괜찮아요 — 아래 "현장 체크인이 안 되나요?"로 코치에게 바로 처리받을 수 있어요.');
      } else if (msg.includes('예약')) {
        setError('예약 없이 체크인하려면 수강권이 필요해요. 아래 현장 체크인 방법으로 코치가 직접 처리해드릴 수 있어요.');
      } else if (msg.includes('만료') || msg.includes('유효')) {
        setError('QR 코드가 만료되었어요. 코치 화면의 최신 QR을 다시 스캔하거나, 아래 현장 체크인 방법을 이용하세요.');
      } else if (msg.includes('형식')) {
        setError('이 QR은 체크인 QR이 아니에요. 코치 화면의 QR을 스캔하거나, 아래 현장 체크인 방법을 이용하세요.');
      } else if (msg.includes('시간')) {
        setError('아직 출석 가능 시간이 아니거나 마감되었어요 (시작 60분 전 ~ 종료 60분 후). 시간이 맞다면 아래 현장 체크인 방법을 이용하세요.');
      } else {
        setError((msg ? msg + ' ' : '') + 'QR이 잘 안 되면 아래 현장 체크인 방법을 이용하세요.');
      }
    }
  };

  const copyMyInfo = async () => {
    const text = `${currentMember.name} / ${currentMember.phone ?? ''}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.success('내 정보 복사됨', '코치 태블릿에 붙여넣거나 그대로 보여주세요.');
    } catch {
      toast.info('내 정보', text);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Page heading */}
      <div>
        <h1 className="page-title">현장 체크인</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          미리 예약하면 가장 편하지만, 예약을 못 했어도 괜찮아요. 현장에서 QR · 휴대폰 카메라 · 코치 호출 중 편한 방법으로 출석하세요.
        </p>
      </div>

      {/* 상황별 한 줄 안내 — 절대 막다른 길을 만들지 않는다 */}
      {hasAnyActivePass && todayReserved.length > 0 && (
        <NoticeBox tone="success" title={`오늘 예약 ${todayReserved.length}건이 있어요`}>
          코치 QR을 스캔하면 바로 출석 처리됩니다. 예약이 있어 가장 빠른 경로예요.
        </NoticeBox>
      )}
      {hasAnyActivePass && todayReserved.length === 0 && (
        <NoticeBox tone="info" title="예약 없이도 현장에서 바로 출석할 수 있어요">
          사용 가능한 수강권이 있으면 코치 QR 스캔만으로 즉시 출석됩니다 (해당 세션에 쓸 수 있는 수강권 기준).
        </NoticeBox>
      )}
      {hasOnlyInactivePass && (
        <NoticeBox
          tone="warning"
          title="수강권이 만료된 상태예요"
          action={{ label: '수강권 보기', onClick: () => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'passes' })) }}
        >
          만료된 회원도 현장 출석이 가능해요. QR이 막히면 아래 "현장 체크인이 안 되나요?"에서 코치를 호출해 처리받으세요.
        </NoticeBox>
      )}
      {!hasAnyActivePass && !hasOnlyInactivePass && (
        <NoticeBox
          tone="info"
          title="처음 오셨거나 수강권이 아직 없으신가요?"
          action={{ label: '멤버십 보기', onClick: () => window.dispatchEvent(new CustomEvent('member:navigate', { detail: 'membership' })) }}
        >
          신규 참가자도 환영해요. 현장에서 코치를 호출하면 첫 1회 체험·결제 안내와 함께 출석을 처리해드립니다.
        </NoticeBox>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Scanner panel */}
        <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">방법 1 · QR 스캔</h2>
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
                      {todayReserved.length > 0
                        ? `오늘 ${todayReserved.length}개 예약 · 코치 QR을 비춰주세요`
                        : '코치 QR을 비춰주세요'}
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
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setError('');
                        startScanning();
                      }}
                      disabled={!cameraSupported || detectorSupported === false}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-danger)] hover:underline disabled:opacity-50"
                    >
                      <RefreshCw size={11} />
                      다시 스캔
                    </button>
                    <button
                      onClick={() => {
                        setShowFallback(true);
                        document.getElementById('checkin-fallback')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-secondary)] hover:underline"
                    >
                      <UserCheck size={11} />
                      현장 체크인 방법 보기
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="mt-4 text-[12px] text-[var(--color-text-muted)] leading-relaxed">
              앱 스캐너가 안 되면 <span className="font-medium text-[var(--color-text-secondary)]">휴대폰 기본 카메라</span>로 코치 QR을 비춰도 체크인 링크가 열려요.
            </p>
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
                  오늘 예약 내역이 없어요. 예약 없이 현장 출석도 가능해요.
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

          {/* 방법 2 · 현장 체크인 폴백 — 항상 사용 가능 */}
          <section
            id="checkin-fallback"
            className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden scroll-mt-20"
          >
            <button
              onClick={() => setShowFallback(v => !v)}
              className="w-full px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between text-left hover:bg-[var(--color-bg-subtle)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserCheck size={15} className="text-[var(--color-primary)]" />
                <h2 className="text-[14px] font-semibold text-[var(--color-text)]">방법 2 · 현장 체크인이 안 되나요?</h2>
              </div>
              <ChevronDown
                size={16}
                className={`text-[var(--color-text-muted)] transition-transform ${showFallback ? 'rotate-180' : ''}`}
              />
            </button>

            {showFallback && (
              <div className="p-4 space-y-4">
                <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                  QR이 먹통이거나, 신규 참가자거나, 수강권이 만료됐어도 괜찮아요. 아래 정보를 코치에게 보여주면 코치가 태블릿에서 바로 출석 처리해드립니다.
                </p>

                {/* 코치에게 보여줄 내 신원 카드 */}
                <div className="rounded-lg border border-[var(--color-primary-border)] bg-[var(--color-primary-bg)]/40 p-4">
                  <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">코치에게 보여주세요</p>
                  <p className="text-[22px] font-bold text-[var(--color-text)] mt-1">{currentMember.name}</p>
                  <p className="text-[15px] text-[var(--color-text-secondary)] tabular-nums mt-0.5 flex items-center gap-1.5">
                    <Phone size={13} className="shrink-0" />
                    {currentMember.phone || '연락처 미등록'}
                  </p>
                  <button
                    onClick={copyMyInfo}
                    className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 text-[12.5px] font-medium text-[var(--color-primary)] bg-white border border-[var(--color-primary-border)] rounded hover:bg-[var(--color-primary-bg)] transition-colors"
                  >
                    <Copy size={13} />
                    이름 · 연락처 복사
                  </button>
                </div>

                <ol className="space-y-2.5">
                  {[
                    '코치에게 "현장 출석이요"라고 말하고 위 이름·연락처를 보여주세요.',
                    '코치가 태블릿에서 이름/연락처로 검색해 즉시 출석 처리합니다. (예약·수강권 자동 확인)',
                    '신규이거나 수강권이 만료된 경우, 코치가 체험·결제 안내와 함께 처리해드려요.',
                  ].map((text, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] text-[var(--color-text-secondary)]">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-primary)] text-[11px] font-semibold text-white flex items-center justify-center tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex-1 leading-relaxed pt-0.5">{text}</span>
                    </li>
                  ))}
                </ol>

                <button
                  onClick={() =>
                    toast.success(
                      '코치를 호출하세요',
                      '위 이름·연락처를 코치에게 보여주면 태블릿에서 바로 출석 처리됩니다.'
                    )
                  }
                  className="w-full h-11 rounded-lg bg-[var(--color-primary)] text-white text-[14px] font-semibold hover:opacity-90 inline-flex items-center justify-center gap-2"
                >
                  <UserCheck size={16} />
                  코치 호출 안내 보기
                </button>
              </div>
            )}
          </section>

          {/* 간단 안내 */}
          <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
              <h2 className="text-[14px] font-semibold text-[var(--color-text)]">체크인 한눈에 보기</h2>
            </div>
            <ul className="px-4 py-3 space-y-2">
              {[
                '미리 예약하면 가장 편하지만, 당일 현장 출석도 언제나 환영해요.',
                '출석 가능 시간: 세션 시작 60분 전 ~ 종료 60분 후.',
                '예약이 없어도 사용 가능한 수강권이 있으면 QR 스캔만으로 즉시 출석돼요.',
                'QR이 안 되면 위 "현장 체크인이 안 되나요?"에서 코치를 호출하세요.',
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-[var(--color-text-secondary)]">
                  <Info size={13} className="shrink-0 mt-0.5 text-[var(--color-text-muted)]" />
                  <span className="flex-1 leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function NoticeBox({
  tone,
  title,
  children,
  action,
}: {
  tone: 'success' | 'info' | 'warning';
  title: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const styles =
    tone === 'success'
      ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)]'
      : tone === 'warning'
        ? 'bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]'
        : 'bg-[var(--color-bg-subtle)] border-[var(--color-border)]';
  const iconColor =
    tone === 'success'
      ? 'text-[var(--color-success)]'
      : tone === 'warning'
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-text-muted)]';
  const Icon = tone === 'warning' ? AlertCircle : Info;
  return (
    <div className={`flex items-start gap-2.5 border rounded-md px-4 py-3 ${styles}`}>
      <Icon size={16} className={`${iconColor} shrink-0 mt-0.5`} />
      <div className="flex-1 text-[13px]">
        <p className="font-medium text-[var(--color-text)]">{title}</p>
        <p className="text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{children}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className={`shrink-0 inline-flex items-center justify-center min-h-9 px-3 text-[12.5px] font-medium hover:underline ${iconColor}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
