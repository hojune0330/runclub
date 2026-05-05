'use client';

import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { formatKoreanDate, cn, getDaysUntilExpiry } from '@/lib/utils';
import { LogOut, Lock, HelpCircle, Phone, Mail, User, CalendarDays, ChevronRight } from 'lucide-react';
import { sessionTypeConfig } from '@/lib/config';

export default function Profile() {
  const { currentMember, memberPasses } = useApp();
  const { logout } = useAuth();
  const myActivePasses = memberPasses.filter(
    p => p.memberId === currentMember.id && p.status === 'active'
  );

  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await logout();
    }
  };

  return (
    <div className="space-y-6 max-w-[900px]">
      {/* Page heading */}
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">프로필</h1>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
          계정 정보와 활성 수강권을 확인하고 설정을 변경할 수 있습니다.
        </p>
      </div>

      {/* Profile card */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">계정 정보</h2>
        </div>
        <div className="px-4 py-5 flex items-center gap-4 border-b border-[var(--color-border-subtle)]">
          <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
            <span className="text-[20px] text-white font-semibold">
              {currentMember.name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-semibold text-[var(--color-text)]">{currentMember.name}</p>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 tabular-nums">
              가입일 {formatKoreanDate(currentMember.joinDate, 'yyyy년 M월 d일')}
            </p>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--color-primary-bg)] text-[var(--color-primary)] border border-[var(--color-primary-border)]">
            회원
          </span>
        </div>
        <dl className="divide-y divide-[var(--color-border-subtle)]">
          <InfoRow icon={User} label="이름">
            {currentMember.name}
          </InfoRow>
          <InfoRow icon={Phone} label="연락처">
            <span className="tabular-nums">{currentMember.phone}</span>
          </InfoRow>
          <InfoRow icon={Mail} label="이메일">
            {currentMember.email || <span className="text-[var(--color-text-muted)]">등록되지 않음</span>}
          </InfoRow>
          <InfoRow icon={CalendarDays} label="가입일">
            <span className="tabular-nums">{formatKoreanDate(currentMember.joinDate, 'yyyy.M.d')}</span>
          </InfoRow>
        </dl>
      </section>

      {/* Active passes */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">활성 수강권</h2>
          <span className="text-[12px] text-[var(--color-text-muted)]">{myActivePasses.length}건</span>
        </div>
        {myActivePasses.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] text-[var(--color-text-muted)]">활성 수강권이 없습니다.</p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                <th className="text-left font-medium px-4 py-2.5">수강권</th>
                <th className="text-left font-medium px-4 py-2.5 w-[160px]">적용 세션</th>
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">잔여</th>
                <th className="text-right font-medium px-4 py-2.5 w-[140px]">만료일</th>
              </tr>
            </thead>
            <tbody>
              {myActivePasses.map(pass => {
                const daysLeft = getDaysUntilExpiry(pass);
                const applicableLabels =
                  pass.applicableSessions === 'all'
                    ? '전체 세션'
                    : pass.applicableSessions.map(s => sessionTypeConfig[s].label).join(', ');
                return (
                  <tr
                    key={pass.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)]"
                  >
                    <td className="px-4 py-3 text-[var(--color-text)] font-medium">{pass.productName}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{applicableLabels}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] tabular-nums">
                      {pass.category === 'count'
                        ? `${pass.remainingCount} / ${pass.totalCount}회`
                        : pass.category === 'season'
                        ? '시즌권'
                        : '월권'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={cn(
                          daysLeft <= 7
                            ? 'text-[var(--color-danger)]'
                            : daysLeft <= 14
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-text-secondary)]'
                        )}
                      >
                        {formatKoreanDate(pass.expiryDate, 'yyyy.M.d')} (D-{daysLeft})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Settings */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">설정</h2>
        </div>
        <div>
          {[
            { icon: Lock, label: '비밀번호 변경', desc: '계정 보안을 위해 주기적으로 변경하세요.' },
            { icon: HelpCircle, label: '문의하기', desc: '궁금한 점은 관리자에게 문의하세요.' },
          ].map(item => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-subtle)] transition-colors text-left"
            >
              <item.icon size={16} className="text-[var(--color-text-muted)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--color-text)] font-medium">{item.label}</p>
                <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{item.desc}</p>
              </div>
              <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
            </button>
          ))}
        </div>
      </section>

      {/* Logout */}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] bg-white px-4 py-2 rounded hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger-border)] transition-colors"
        >
          <LogOut size={14} />
          로그아웃
        </button>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-3 items-center">
      <dt className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)] font-medium">
        <Icon size={13} />
        {label}
      </dt>
      <dd className="text-[13px] text-[var(--color-text)]">{children}</dd>
    </div>
  );
}
