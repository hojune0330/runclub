'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Check, Share2, MessageCircle, Link2, QrCode as QrIcon, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { useApp } from '@/store/AppContext';
import { cn } from '@/lib/utils';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional session to share. If not provided, a generic club invite is created. */
  session?: { id: string; name: string; date: string; startTime: string } | null;
}

export default function InviteModal({ open, onClose, session }: InviteModalProps) {
  const { currentMember } = useApp();
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Generate a deterministic invite code from member id (short & shareable)
  const inviteCode = useMemo(() => {
    const base = (currentMember?.id || 'guest').toString();
    // Simple hash → 6 chars
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
    }
    const code = hash.toString(36).toUpperCase().padEnd(6, 'X').slice(0, 6);
    return `RC${code}`;
  }, [currentMember?.id]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = session
    ? `${baseUrl}/invite/${inviteCode}?s=${session.id}`
    : `${baseUrl}/invite/${inviteCode}`;

  const shareTitle = session
    ? `${currentMember?.name}님이 런클럽 "${session.name}" 세션에 초대했어요`
    : `${currentMember?.name}님이 런클럽에 초대했어요`;

  const shareText = session
    ? `[런클럽] ${session.name} 세션에 함께해요!\n일시: ${session.date} ${session.startTime}\n참여 링크: ${inviteUrl}`
    : `[런클럽] 함께 달려요!\n${currentMember?.name}님의 초대 링크: ${inviteUrl}\n초대코드: ${inviteCode}`;

  // Generate QR
  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(inviteUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#1a1d21', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [open, inviteUrl]);

  const handleCopy = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: inviteUrl });
      } catch {
        // user cancelled
      }
    } else {
      await handleCopy(shareText, 'link');
    }
  };

  const handleKakaoShare = () => {
    // Open a simple share window using KakaoTalk's sendMe URL scheme fallback.
    // In production integrate Kakao SDK; here we fall back to native share or copy.
    const url = `https://story.kakao.com/share?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=520,height=640');
  };

  const handleSmsShare = () => {
    window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[440px] max-w-[92vw] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary-bg)] flex items-center justify-center">
              <Users size={14} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">
              {session ? '세션 공유' : '친구 초대'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Message preview */}
          <div className="bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded-md p-3">
            <p className="text-[13px] text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
              {shareText}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex gap-4 items-center border border-[var(--color-border)] rounded-md p-3">
            <div className="shrink-0 w-[120px] h-[120px] bg-white flex items-center justify-center border border-[var(--color-border-subtle)] rounded">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="초대 QR 코드" className="w-full h-full object-contain" />
              ) : (
                <div className="text-[var(--color-text-muted)]">
                  <QrIcon size={32} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-[var(--color-text-secondary)] font-medium mb-1">
                QR 스캔으로 초대
              </p>
              <p className="text-[11.5px] text-[var(--color-text-muted)] mb-2 leading-relaxed">
                친구의 카메라로 이 QR을 스캔하면 초대 페이지가 열려요.
              </p>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                초대 코드
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <code className="text-[13px] font-mono font-semibold text-[var(--color-text)] tracking-wider">
                  {inviteCode}
                </code>
                <button
                  onClick={() => handleCopy(inviteCode, 'code')}
                  className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                  title="코드 복사"
                >
                  {copied === 'code' ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* Link box */}
          <div>
            <p className="text-[12px] text-[var(--color-text-secondary)] font-medium mb-1.5">
              초대 링크
            </p>
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={inviteUrl}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 px-2.5 py-2 text-[12.5px] border border-[var(--color-border)] rounded bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] tabular-nums truncate"
              />
              <button
                onClick={() => handleCopy(inviteUrl, 'link')}
                className={cn(
                  'px-3 py-2 rounded text-[12.5px] font-medium border transition-colors inline-flex items-center gap-1',
                  copied === 'link'
                    ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
                    : 'bg-white border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]'
                )}
              >
                {copied === 'link' ? <Check size={12} /> : <Copy size={12} />}
                {copied === 'link' ? '복사됨' : '복사'}
              </button>
            </div>
          </div>

          {/* Share buttons */}
          <div>
            <p className="text-[12px] text-[var(--color-text-secondary)] font-medium mb-1.5">
              공유하기
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ShareButton
                onClick={handleKakaoShare}
                icon={MessageCircle}
                label="카카오"
                color="#FEE500"
                textColor="#1a1d21"
              />
              <ShareButton
                onClick={handleSmsShare}
                icon={Link2}
                label="문자"
                color="#0f9d58"
                textColor="#ffffff"
              />
              <ShareButton
                onClick={handleNativeShare}
                icon={Share2}
                label="더보기"
                color="var(--color-bg-hover)"
                textColor="var(--color-text)"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-subtle)] text-[11.5px] text-[var(--color-text-muted)] text-center">
          친구가 가입하면 함께 달릴 준비 완료 🏃
        </div>
      </div>
    </div>
  );
}

function ShareButton({
  onClick,
  icon: Icon,
  label,
  color,
  textColor,
}: {
  onClick: () => void;
  icon: typeof Share2;
  label: string;
  color: string;
  textColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-medium transition-transform hover:scale-[1.02] active:scale-[0.98]"
      style={{ backgroundColor: color, color: textColor }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
