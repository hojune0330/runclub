'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, X, Phone, Mail, Calendar as CalIcon,
  KeyRound, UserX, UserCheck, ShieldCheck, ShieldOff, Trash2, Copy,
  FileSpreadsheet, RefreshCw, AlertTriangle, TicketPlus,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { api, type PasswordResetRequestDto, type MemberSheetImportPreview } from '@/lib/api';
import { sessionTypeConfig, reservationStatusConfig, passStatusConfig } from '@/lib/config';
import { formatKoreanDate, cn, getDaysUntilExpiry } from '@/lib/utils';
import { Modal, FormField, Badge, useToast } from '@/components/ui';
import { IssuePassModal } from '@/components/admin/PassManagement';
import type { Member } from '@/types';

export default function MemberManagement() {
  const {
    members, memberPasses, reservations, sessions, addMember,
    resetMemberPassword, deleteMember, setMemberActive, setMemberRole, refreshMembers,
    passProducts, issueMemberPass,
  } = useApp();
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showIssuePass, setShowIssuePass] = useState(false);

  // Admin action busy/result state
  const [actionBusy, setActionBusy] = useState(false);
  const [tempPwInfo, setTempPwInfo] = useState<{ memberName: string; tempPassword: string } | null>(null);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequestDto[]>([]);
  const [resetRequestsLoading, setResetRequestsLoading] = useState(false);
  const [resetRequestBusyId, setResetRequestBusyId] = useState<string | null>(null);
  const [sheetPreview, setSheetPreview] = useState<MemberSheetImportPreview | null>(null);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [sheetApplyLoading, setSheetApplyLoading] = useState(false);

  // Add form
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const filteredMembers = useMemo(() => {
    return members
      .filter(m => {
        if (filter === 'active' && !m.isActive) return false;
        if (filter === 'inactive' && m.isActive) return false;
        if (search && !m.name.includes(search) && !m.phone.includes(search)) return false;
        return true;
      })
      .sort((a, b) => b.joinDate.localeCompare(a.joinDate));
  }, [members, search, filter]);

  const pendingResetRequests = useMemo(
    () => resetRequests.filter(r => r.status === 'pending'),
    [resetRequests]
  );

  const sheetFieldLabels: Record<string, string> = {
    sheetManagerMemo: '매니저메모',
    sheetTag: '태그',
    sheetMemberGrade: '회원등급',
    sheetAcquisitionSource: '유입경로',
    sheetNextContactDate: '다음컨택예정일',
    sheetAssignedManager: '담당매니저',
  };

  const authReasonLabel: Record<string, string> = {
    success: '로그인 성공',
    invalid_phone: '번호 형식 오류',
    no_account: '계정 없음',
    inactive: '비활성 계정',
    locked: '로그인 잠김',
    wrong_password: '비밀번호 불일치',
    rate_limited: '요청 과다',
    reset_requested: '재설정 요청',
    reset_name_mismatch: '재설정 이름 불일치',
    reset_inactive: '비활성 재설정 요청',
    reset_no_account: '미등록 재설정 요청',
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${formatKoreanDate(date.toISOString().slice(0, 10), 'yy.M.d')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getLoginSupportInfo = (m: Member) => {
    const lockedUntil = m.lockedUntil ? new Date(m.lockedUntil) : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      return {
        tone: 'danger' as const,
        label: '로그인 잠김',
        detail: `${formatDateTime(m.lockedUntil) ?? '잠시 후'}까지 자동 해제`,
      };
    }
    if (!m.isActive) {
      return { tone: 'muted' as const, label: '비활성', detail: '활성화 전에는 로그인 불가' };
    }
    if (m.mustChangePassword) {
      return { tone: 'warning' as const, label: '비번 변경 필요', detail: '임시 비밀번호 로그인 후 변경 필요' };
    }
    if ((m.failedLoginCount ?? 0) > 0) {
      return {
        tone: 'warning' as const,
        label: `실패 ${m.failedLoginCount}회`,
        detail: `${formatDateTime(m.lastLoginFailedAt) ?? '최근'} 비밀번호 불일치`,
      };
    }
    if (m.lastAuthEventReason === 'reset_name_mismatch') {
      return { tone: 'warning' as const, label: '이름 확인', detail: '재설정 요청 이름이 회원명과 다름' };
    }
    if (m.lastLoginAt) {
      return { tone: 'success' as const, label: '최근 로그인', detail: formatDateTime(m.lastLoginAt) ?? '로그인 기록 있음' };
    }
    return { tone: 'default' as const, label: '이상 없음', detail: '최근 로그인 오류 없음' };
  };

  const loginSupportMembers = useMemo(() => {
    return members
      .filter(m => {
        const lockedUntil = m.lockedUntil ? new Date(m.lockedUntil) : null;
        return (
          !m.isActive ||
          !!m.mustChangePassword ||
          (m.failedLoginCount ?? 0) > 0 ||
          !!(lockedUntil && lockedUntil.getTime() > Date.now()) ||
          m.lastAuthEventReason === 'reset_name_mismatch'
        );
      })
      .slice(0, 8);
  }, [members]);

  const loadResetRequests = async () => {
    setResetRequestsLoading(true);
    try {
      const res = await api.passwordResetRequests.list({ status: 'pending', limit: 50 });
      setResetRequests(res.requests ?? []);
    } catch (err: any) {
      toast.error('비밀번호 재설정 요청을 불러오지 못했어요', err?.message);
    } finally {
      setResetRequestsLoading(false);
    }
  };

  useEffect(() => {
    void loadResetRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSheetPreview = async () => {
    setSheetPreviewLoading(true);
    try {
      const res = await api.sheetMemberImport.preview();
      setSheetPreview(res);
      if (!res.enabled) {
        toast.warning('시트 가져오기가 비활성화되어 있어요', res.warnings[0]?.message);
      } else if (res.stats.changes === 0) {
        toast.success('가져올 시트 메타데이터 변경분이 없습니다');
      } else {
        toast.success(`시트 변경 ${res.stats.changes}건을 찾았어요`, '적용 전 아래 미리보기를 확인하세요.');
      }
    } catch (err: any) {
      toast.error('시트 변경사항 미리보기에 실패했어요', err?.message);
    } finally {
      setSheetPreviewLoading(false);
    }
  };

  const handleSheetApply = async () => {
    if (!sheetPreview || sheetPreview.stats.changes === 0 || sheetApplyLoading) return;
    if (!confirm(`Google Sheets Members 탭의 J~O 메타데이터 ${sheetPreview.stats.changes}건을 웹 회원 관리에 반영할까요?\n\n이 작업은 이름/연락처/권한/활성여부 같은 핵심 정보는 변경하지 않습니다.`)) return;
    setSheetApplyLoading(true);
    try {
      const res = await api.sheetMemberImport.apply();
      setSheetPreview(res);
      await refreshMembers();
      toast.success(`시트 메타데이터 ${res.applied ?? 0}건을 반영했어요`);
    } catch (err: any) {
      toast.error('시트 변경사항 적용에 실패했어요', err?.message);
    } finally {
      setSheetApplyLoading(false);
    }
  };

  const memberDetail = useMemo(() => {
    if (!selectedMember) return null;
    const passes = memberPasses.filter(p => p.memberId === selectedMember.id);
    const memberReservations = reservations
      .filter(r => r.memberId === selectedMember.id)
      .map(r => ({ ...r, session: r.session || sessions.find(s => s.id === r.sessionId) }))
      .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));
    return { passes, reservations: memberReservations };
  }, [selectedMember, memberPasses, reservations, sessions]);

  const handleAddMember = async () => {
    if (!formName.trim() || !formPhone.trim()) return;
    const result = await addMember({
      name: formName.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim() || undefined,
      joinDate: new Date().toISOString().split('T')[0],
      isActive: true,
    });
    if (result) {
      setShowAdd(false);
      setFormName('');
      setFormPhone('');
      setFormEmail('');
      if (result.defaultPassword) {
        // Show in the same modal flow as the password reset for consistency.
        setTempPwInfo({
          memberName: result.name ?? formName.trim(),
          tempPassword: result.defaultPassword,
        });
      }
    }
  };

  // ─── Admin actions on the selected member ───
  const isSelf = !!(selectedMember && currentUser && selectedMember.id === currentUser.id);

  const handleResetPassword = async () => {
    if (!selectedMember || actionBusy) return;
    if (isSelf) {
      toast.warning('본인 계정 비밀번호는 직접 변경할 수 없어요', '마이페이지의 비밀번호 변경 메뉴를 사용해 주세요.');
      return;
    }
    if (!confirm(`'${selectedMember.name}' 회원의 비밀번호를 임시 비밀번호로 재발급할까요?\n\n기존 세션은 모두 즉시 로그아웃되며, 첫 로그인 시 비밀번호 변경이 강제됩니다.`)) return;
    setActionBusy(true);
    try {
      const r = await resetMemberPassword(selectedMember.id);
      if (r) setTempPwInfo({ memberName: r.memberName, tempPassword: r.tempPassword });
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedMember || actionBusy) return;
    if (isSelf) {
      toast.warning('본인 계정은 비활성화할 수 없어요');
      return;
    }
    const willDeactivate = selectedMember.isActive;
    const msg = willDeactivate
      ? `'${selectedMember.name}' 회원을 비활성화할까요?\n\n진행 중인 모든 로그인 세션이 즉시 만료되고 로그인 자체가 차단됩니다.`
      : `'${selectedMember.name}' 회원을 다시 활성화할까요?`;
    if (!confirm(msg)) return;
    setActionBusy(true);
    try {
      const ok = await setMemberActive(selectedMember.id, !willDeactivate);
      if (ok) {
        // Reflect the new state locally so the buttons swap immediately.
        setSelectedMember({
          ...selectedMember,
          isActive: !willDeactivate,
          failedLoginCount: willDeactivate ? selectedMember.failedLoginCount : 0,
          lockedUntil: willDeactivate ? selectedMember.lockedUntil : null,
          lastLoginFailedAt: willDeactivate ? selectedMember.lastLoginFailedAt : null,
        });
      }
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleRole = async () => {
    if (!selectedMember || actionBusy) return;
    const isAdmin = selectedMember.role === 'admin';
    if (isSelf && isAdmin) {
      toast.warning('본인 권한은 스스로 변경할 수 없어요', '다른 관리자에게 요청해주세요.');
      return;
    }
    const next: 'admin' | 'member' = isAdmin ? 'member' : 'admin';
    const msg = isAdmin
      ? `'${selectedMember.name}' 회원의 권한을 관리자에서 일반 회원으로 변경할까요?\n변경 즉시 모든 세션이 무효화됩니다.`
      : `'${selectedMember.name}' 회원에게 관리자 권한을 부여할까요?\n다음 새로고침부터 관리자 메뉴를 사용할 수 있습니다.`;
    if (!confirm(msg)) return;
    setActionBusy(true);
    try {
      const ok = await setMemberRole(selectedMember.id, next);
      if (ok) setSelectedMember({ ...selectedMember, role: next });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedMember || actionBusy) return;
    if (isSelf) {
      toast.warning('본인 계정은 삭제할 수 없어요');
      return;
    }
    if (selectedMember.role === 'admin') {
      toast.warning('관리자 권한 회원은 삭제할 수 없어요', '먼저 권한을 일반 회원으로 변경해주세요.');
      return;
    }
    if (!confirm(`'${selectedMember.name}' 회원을 영구 삭제할까요?\n\n예약/수강권 이력이 있으면 거부됩니다(이 경우 비활성화로 처리하세요). 이 작업은 되돌릴 수 없습니다.`)) return;
    setActionBusy(true);
    try {
      const ok = await deleteMember(selectedMember.id);
      if (ok) setSelectedMember(null);
    } finally {
      setActionBusy(false);
    }
  };

  const handleApproveResetRequest = async (request: PasswordResetRequestDto) => {
    if (resetRequestBusyId) return;
    if (currentUser?.id === request.memberId) {
      toast.warning('본인 계정은 요청함에서 초기화할 수 없어요', '마이페이지의 비밀번호 변경 메뉴를 사용해 주세요.');
      return;
    }
    if (!confirm(`'${request.memberName}' 회원에게 임시 비밀번호를 발급할까요?\n\n기존 로그인 세션은 즉시 만료되고, 첫 로그인 시 비밀번호 변경이 강제됩니다.`)) return;
    setResetRequestBusyId(request.id);
    try {
      const res = await api.passwordResetRequests.approve(request.id);
      setTempPwInfo({ memberName: res.memberName, tempPassword: res.tempPassword });
      await loadResetRequests();
    } catch (err: any) {
      toast.error('재설정 요청 처리에 실패했어요', err?.message);
    } finally {
      setResetRequestBusyId(null);
    }
  };

  const handleRejectResetRequest = async (request: PasswordResetRequestDto) => {
    if (resetRequestBusyId) return;
    const note = prompt(`'${request.memberName}' 회원의 비밀번호 재설정 요청을 거절/닫기 처리할까요?\n메모를 남기려면 입력하세요.`, '관리자 확인 후 요청 종료');
    if (note === null) return;
    setResetRequestBusyId(request.id);
    try {
      await api.passwordResetRequests.reject(request.id, note.trim() || undefined);
      await loadResetRequests();
    } catch (err: any) {
      toast.error('요청 닫기에 실패했어요', err?.message);
    } finally {
      setResetRequestBusyId(null);
    }
  };

  const copyTempPassword = async () => {
    if (!tempPwInfo) return;
    try {
      await navigator.clipboard.writeText(tempPwInfo.tempPassword);
      toast.success('임시 비밀번호를 클립보드에 복사했어요');
    } catch {
      // Clipboard may be blocked (e.g. http) — fall back to a manual hint.
      toast.error('자동 복사에 실패했어요', '화면에 표시된 비밀번호를 직접 복사해 주세요.');
    }
  };

  // Count per member
  const activePassCountByMember = useMemo(() => {
    const m: Record<string, number> = {};
    memberPasses.forEach(p => {
      if (p.status === 'active') {
        m[p.memberId] = (m[p.memberId] || 0) + 1;
      }
    });
    return m;
  }, [memberPasses]);

  const lastAttendanceByMember = useMemo(() => {
    const m: Record<string, string> = {};
    reservations.forEach(r => {
      if (r.status === 'attended') {
        const s = r.session || sessions.find(x => x.id === r.sessionId);
        if (s && (!m[r.memberId] || s.date > m[r.memberId])) {
          m[r.memberId] = s.date;
        }
      }
    });
    return m;
  }, [reservations, sessions]);

  return (
    <div className="max-w-[1400px] space-y-5">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">회원 관리</h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-0.5">
            전체 {members.length}명 · 활성 {members.filter(m => m.isActive).length}명 · 로그인 확인 {loginSupportMembers.length}명
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="h-11 md:h-9 flex items-center gap-1.5 px-3.5 text-[13px] font-medium text-white bg-[var(--color-primary)] rounded hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <Plus size={15} />
          회원 등록
        </button>
      </div>

      {/* Login support summary */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
              <KeyRound size={14} />
              로그인 확인
              {loginSupportMembers.length > 0 && <Badge tone="warning">{loginSupportMembers.length}명 확인</Badge>}
            </h2>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
              잠김·임시 비밀번호·비활성처럼 문의가 생기기 쉬운 상태를 먼저 보여줍니다.
            </p>
          </div>
        </div>
        {loginSupportMembers.length === 0 ? (
          <div className="px-4 py-4 text-[13px] text-[var(--color-text-muted)]">
            현재 바로 확인해야 할 로그인 상태가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {loginSupportMembers.map(m => {
              const info = getLoginSupportInfo(m);
              return (
                <li key={m.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-[var(--color-text)]">{m.name}</span>
                      <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">{m.phone}</span>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </div>
                    <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                      {info.detail}
                      {m.lastAuthEventReason && ` · 최근 기록: ${authReasonLabel[m.lastAuthEventReason] ?? m.lastAuthEventReason}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMember(m)}
                    className="h-8 px-2.5 text-[12px] rounded border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] self-start md:self-auto"
                  >
                    회원 보기
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Password reset request inbox */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
              <KeyRound size={14} />
              비밀번호 재설정 요청
              {pendingResetRequests.length > 0 && <Badge tone="warning">{pendingResetRequests.length}건 대기</Badge>}
            </h2>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
              회원이 로그인 화면에서 요청하면 여기서 임시 비밀번호를 발급하고 전달합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={loadResetRequests}
            disabled={resetRequestsLoading}
            className="h-8 px-3 text-[12px] rounded border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] disabled:text-[var(--color-text-disabled)]"
          >
            {resetRequestsLoading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>

        {pendingResetRequests.length === 0 ? (
          <div className="px-4 py-5 text-[13px] text-[var(--color-text-muted)]">
            {resetRequestsLoading ? '요청을 불러오는 중입니다.' : '대기 중인 비밀번호 재설정 요청이 없습니다.'}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-subtle)]">
            {pendingResetRequests.map(req => {
              const busy = resetRequestBusyId === req.id;
              const member = members.find(m => m.id === req.memberId);
              return (
                <li key={req.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-[var(--color-text)]">{req.memberName}</span>
                      <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">{req.memberPhone}</span>
                      {!req.memberIsActive && <Badge tone="muted">비활성</Badge>}
                    </div>
                    <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                      요청 입력값: {req.requestName} · {req.requestPhone} · {formatKoreanDate(String(req.requestedAt).slice(0, 10), 'yy.M.d')}
                    </p>
                    {req.requesterNote && (
                      <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1 truncate">“{req.requesterNote}”</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (member) setSelectedMember(member);
                      }}
                      className="h-8 px-2.5 text-[12px] rounded border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                    >
                      회원 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectResetRequest(req)}
                      disabled={!!resetRequestBusyId}
                      className="h-8 px-2.5 text-[12px] rounded border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] disabled:text-[var(--color-text-disabled)]"
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveResetRequest(req)}
                      disabled={!!resetRequestBusyId || currentUser?.id === req.memberId || !req.memberIsActive}
                      className={cn(
                        "h-8 px-3 text-[12px] font-medium rounded transition-colors",
                        !!resetRequestBusyId || currentUser?.id === req.memberId || !req.memberIsActive
                          ? "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)] cursor-not-allowed"
                          : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                      )}
                    >
                      {busy ? '처리 중…' : '임시 비밀번호 발급'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Google Sheets metadata import */}
      <section className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text)] flex items-center gap-1.5">
              <FileSpreadsheet size={14} />
              Google Sheets 메타데이터 가져오기
              {sheetPreview?.enabled && sheetPreview.stats.changes > 0 && <Badge tone="primary">{sheetPreview.stats.changes}건 변경</Badge>}
            </h2>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
              Members 탭의 J~O(매니저 메모·태그·등급·유입경로·컨택일·담당자)만 웹으로 가져옵니다. A~I 핵심 정보는 웹 DB 기준으로 유지됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSheetPreview}
              disabled={sheetPreviewLoading || sheetApplyLoading}
              className="h-9 px-3 text-[12.5px] rounded border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] disabled:text-[var(--color-text-disabled)] inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={sheetPreviewLoading ? 'animate-spin' : ''} />
              {sheetPreviewLoading ? '확인 중…' : '변경 미리보기'}
            </button>
            <button
              type="button"
              onClick={handleSheetApply}
              disabled={!sheetPreview?.enabled || !sheetPreview.stats.changes || sheetPreviewLoading || sheetApplyLoading}
              className={cn(
                "h-9 px-3 text-[12.5px] font-medium rounded transition-colors",
                !sheetPreview?.enabled || !sheetPreview.stats.changes || sheetPreviewLoading || sheetApplyLoading
                  ? "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)] cursor-not-allowed"
                  : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
              )}
            >
              {sheetApplyLoading ? '적용 중…' : '미리보기 적용'}
            </button>
          </div>
        </div>

        {sheetPreview ? (
          <div className="px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <span>시트 행 {sheetPreview.stats.sheetRows}개</span>
              <span>· 매칭 {sheetPreview.stats.matchedRows}개</span>
              <span>· 변경 {sheetPreview.stats.changes}개</span>
              {sheetPreview.stats.blockedRows > 0 && <span className="text-[var(--color-danger)]">· 보류 {sheetPreview.stats.blockedRows}개</span>}
              {sheetPreview.applied !== undefined && <Badge tone="success">최근 적용 {sheetPreview.applied}건</Badge>}
            </div>

            {sheetPreview.warnings.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-amber-800 mb-1">
                  <AlertTriangle size={13} /> 확인 필요 {sheetPreview.warnings.length}건
                </div>
                <ul className="space-y-1 text-[12px] text-amber-800 max-h-28 overflow-y-auto">
                  {sheetPreview.warnings.slice(0, 8).map((w, idx) => (
                    <li key={`${w.rowNumber}-${idx}`}>행 {w.rowNumber || '-'} · {w.message}</li>
                  ))}
                  {sheetPreview.warnings.length > 8 && <li>외 {sheetPreview.warnings.length - 8}건 더 있음</li>}
                </ul>
              </div>
            )}

            {sheetPreview.changes.length > 0 ? (
              <div className="border border-[var(--color-border)] rounded overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-bg-subtle)] text-[12px] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  적용 예정 변경 미리보기 (최대 5건 표시)
                </div>
                <ul className="divide-y divide-[var(--color-border-subtle)]">
                  {sheetPreview.changes.slice(0, 5).map(change => (
                    <li key={`${change.memberId}-${change.rowNumber}`} className="px-3 py-2 text-[12.5px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--color-text)]">{change.memberName}</span>
                        <span className="text-[var(--color-text-muted)] tabular-nums">행 {change.rowNumber} · {change.phone}</span>
                      </div>
                      <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
                        {change.changedFields.map(f => sheetFieldLabels[f] || f).join(', ')} 변경
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[12.5px] text-[var(--color-text-muted)]">
                {sheetPreview.enabled ? '시트에서 가져올 매니저 메타데이터 변경분이 없습니다.' : '환경변수 설정 후 사용할 수 있습니다.'}
              </p>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-[var(--color-text-muted)]">
            먼저 “변경 미리보기”로 시트와 웹 DB의 차이를 확인하세요. 시트 행 삭제나 A~I 수정은 자동 반영하지 않습니다.
          </div>
        )}
      </section>

      {/* Filter bar */}
      <div className="bg-white border border-[var(--color-border)] rounded-md px-3 md:px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
        <div className="relative w-full md:w-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름 또는 연락처로 검색"
            className="pl-8 pr-3 h-10 md:h-9 text-[16px] md:text-[13px] border border-[var(--color-border)] rounded w-full md:w-[240px] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="hidden md:block h-4 w-px bg-[var(--color-border)]" />

        <div className="flex items-center gap-1 overflow-x-auto md:overflow-visible -mx-3 md:mx-0 px-3 md:px-0 scrollbar-none">
          <span className="text-[12px] text-[var(--color-text-muted)] mr-1 shrink-0">상태</span>
          {([
            { id: 'all', label: '전체' },
            { id: 'active', label: '활성' },
            { id: 'inactive', label: '비활성' },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 h-9 md:h-7 px-3 md:px-2.5 text-[12.5px] md:text-[12px] rounded border transition-colors",
                filter === f.id
                  ? "bg-[var(--color-text)] text-white border-[var(--color-text)]"
                  : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <span className="text-[12px] text-[var(--color-text-muted)]">
          {filteredMembers.length}명
        </span>
      </div>

      {/* List — 모바일은 카드, sm 이상은 테이블 */}
      <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
        {filteredMembers.length === 0 ? (
          <div className="py-14 px-6 text-center text-[13px] text-[var(--color-text-muted)]">
            조회된 회원이 없습니다.
          </div>
        ) : (
          <>
            {/* ── Mobile: 카드 리스트 ── */}
            <ul className="sm:hidden divide-y divide-[var(--color-border-subtle)]">
              {filteredMembers.map(m => {
                const isSelected = selectedMember?.id === m.id;
                const activePasses = activePassCountByMember[m.id] || 0;
                const lastAttend = lastAttendanceByMember[m.id];
                const loginInfo = getLoginSupportInfo(m);
                return (
                  <li
                    key={m.id}
                    onClick={() => setSelectedMember(m)}
                    className={cn(
                      "px-3 py-3 cursor-pointer transition-colors",
                      isSelected ? "bg-[var(--color-primary-bg)]" : "hover:bg-[var(--color-bg-subtle)]"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center shrink-0">
                        <span className="text-[13px] text-[var(--color-text-secondary)] font-medium">{m.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-semibold text-[var(--color-text)] truncate">{m.name}</span>
                          {m.isActive
                            ? <Badge tone="success" className="shrink-0">활성</Badge>
                            : <Badge tone="muted" className="shrink-0">비활성</Badge>}
                          {loginInfo.label !== '이상 없음' && <Badge tone={loginInfo.tone} className="shrink-0">{loginInfo.label}</Badge>}
                        </div>
                        <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 tabular-nums truncate">
                          {m.phone}
                          {m.email && <> · {m.email}</>}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1.5 tabular-nums truncate">
                      가입 {formatKoreanDate(m.joinDate, 'yy.M.d')}
                      {activePasses > 0 && ` · 수강권 ${activePasses}건`}
                      {lastAttend && ` · 최근 출석 ${formatKoreanDate(lastAttend, 'yy.M.d')}`}
                    </p>
                  </li>
                );
              })}
            </ul>

            {/* ── Desktop (sm+): 테이블 ── */}
            <div className="hidden sm:block scroll-x">
              <table className="responsive-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]">
                    <th className="text-left font-medium px-4 py-2.5">이름</th>
                    <th className="text-left font-medium px-4 py-2.5">연락처</th>
                    <th className="text-left font-medium px-4 py-2.5">이메일</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[110px]">가입일</th>
                    <th className="text-center font-medium px-4 py-2.5 w-[100px]">활성 수강권</th>
                    <th className="text-left font-medium px-4 py-2.5 w-[110px]">최근 출석</th>
                    <th className="text-center font-medium px-4 py-2.5 w-[80px]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map(m => {
                    const isSelected = selectedMember?.id === m.id;
                    const activePasses = activePassCountByMember[m.id] || 0;
                    const lastAttend = lastAttendanceByMember[m.id];
                    const loginInfo = getLoginSupportInfo(m);
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedMember(m)}
                        className={cn(
                          "border-b border-[var(--color-border-subtle)] last:border-0 cursor-pointer transition-colors",
                          isSelected ? "bg-[var(--color-primary-bg)]" : "hover:bg-[var(--color-bg-subtle)]"
                        )}
                      >
                        <td className="px-4 py-2.5 text-[var(--color-text)] font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center shrink-0">
                              <span className="text-[12px] text-[var(--color-text-secondary)] font-medium">{m.name.charAt(0)}</span>
                            </div>
                            {m.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">{m.phone}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{m.email || '—'}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                          {formatKoreanDate(m.joinDate, 'yyyy.M.d')}
                        </td>
                        <td className="px-4 py-2.5 text-center tabular-nums">
                          {activePasses > 0 ? (
                            <span className="text-[var(--color-text)]">{activePasses}건</span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-text-secondary)] tabular-nums">
                          {lastAttend ? formatKoreanDate(lastAttend, 'yyyy.M.d') : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {m.isActive ? (
                              <Badge tone="success">활성</Badge>
                            ) : (
                              <Badge tone="muted">비활성</Badge>
                            )}
                            {loginInfo.label !== '이상 없음' && <Badge tone={loginInfo.tone}>{loginInfo.label}</Badge>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Detail */}
      {selectedMember && memberDetail && (
        <section className="bg-white border border-[var(--color-border)] rounded-md animate-fade-in">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">회원 상세</h2>
            <button onClick={() => setSelectedMember(null)} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <X size={15} />
            </button>
          </div>

          {/* Admin actions toolbar */}
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-white flex flex-wrap items-center gap-2">
            <button
              onClick={handleResetPassword}
              disabled={actionBusy || isSelf}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 md:h-8 px-3 text-[12.5px] rounded border transition-colors",
                isSelf
                  ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-disabled)] border-[var(--color-border)] cursor-not-allowed"
                  : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              )}
              title={isSelf ? '본인 계정은 마이페이지에서 변경하세요' : '임시 비밀번호 재발급'}
            >
              <KeyRound size={13} />
              비밀번호 초기화
            </button>

            <button
              onClick={handleToggleActive}
              disabled={actionBusy || isSelf}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 md:h-8 px-3 text-[12.5px] rounded border transition-colors",
                isSelf
                  ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-disabled)] border-[var(--color-border)] cursor-not-allowed"
                  : selectedMember.isActive
                    ? "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-danger)]"
                    : "bg-white text-[var(--color-success)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              )}
              title={selectedMember.isActive ? '비활성화 (즉시 세션 만료)' : '다시 활성화'}
            >
              {selectedMember.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
              {selectedMember.isActive ? '비활성화' : '활성화'}
            </button>

            <button
              onClick={handleToggleRole}
              disabled={actionBusy || (isSelf && selectedMember.role === 'admin')}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 md:h-8 px-3 text-[12.5px] rounded border transition-colors",
                isSelf && selectedMember.role === 'admin'
                  ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-disabled)] border-[var(--color-border)] cursor-not-allowed"
                  : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              )}
              title={
                selectedMember.role === 'admin'
                  ? '관리자 권한 회수 (일반 회원으로 변경)'
                  : '관리자 권한 부여'
              }
            >
              {selectedMember.role === 'admin' ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
              {selectedMember.role === 'admin' ? '관리자 해제' : '관리자 지정'}
            </button>

            <div className="flex-1" />

            <button
              onClick={handleDelete}
              disabled={actionBusy || isSelf || selectedMember.role === 'admin'}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 md:h-8 px-3 text-[12.5px] rounded border transition-colors",
                isSelf || selectedMember.role === 'admin'
                  ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-disabled)] border-[var(--color-border)] cursor-not-allowed"
                  : "bg-white text-[var(--color-danger)] border-[var(--color-border)] hover:border-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white"
              )}
              title={
                isSelf
                  ? '본인 계정은 삭제할 수 없습니다'
                  : selectedMember.role === 'admin'
                    ? '관리자 권한 회수 후 삭제할 수 있습니다'
                    : '영구 삭제 (이력 없을 때만 가능)'
              }
            >
              <Trash2 size={13} />
              삭제
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-[var(--color-border)]">
            {/* Profile */}
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <span className="text-[16px] text-white font-medium">{selectedMember.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[16px] font-semibold text-[var(--color-text)]">{selectedMember.name}</h3>
                    {selectedMember.isActive ? <Badge tone="success">활성</Badge> : <Badge tone="muted">비활성</Badge>}
                    {selectedMember.role === 'admin' && <Badge tone="primary">관리자</Badge>}
                    {getLoginSupportInfo(selectedMember).label !== '이상 없음' && (
                      <Badge tone={getLoginSupportInfo(selectedMember).tone}>{getLoginSupportInfo(selectedMember).label}</Badge>
                    )}
                  </div>
                </div>
              </div>

              <dl className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <Phone size={13} className="text-[var(--color-text-muted)]" />
                  <span className="tabular-nums">{selectedMember.phone}</span>
                </div>
                {selectedMember.email && (
                  <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    <Mail size={13} className="text-[var(--color-text-muted)]" />
                    {selectedMember.email}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <CalIcon size={13} className="text-[var(--color-text-muted)]" />
                  가입 {formatKoreanDate(selectedMember.joinDate, 'yyyy.M.d')}
                </div>
              </dl>

              <div className="mt-4 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-[11px] text-[var(--color-text-muted)]">로그인 상태</p>
                  <Badge tone={getLoginSupportInfo(selectedMember).tone}>{getLoginSupportInfo(selectedMember).label}</Badge>
                </div>
                <p>{getLoginSupportInfo(selectedMember).detail}</p>
                {selectedMember.lastAuthEventReason && (
                  <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                    최근 기록: {authReasonLabel[selectedMember.lastAuthEventReason] ?? selectedMember.lastAuthEventReason}
                    {selectedMember.lastAuthEventAt && ` · ${formatDateTime(selectedMember.lastAuthEventAt) ?? ''}`}
                  </p>
                )}
              </div>

              {selectedMember.memo && (
                <div className="mt-4 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] rounded text-[12.5px] text-[var(--color-text-secondary)] leading-relaxed">
                  <p className="text-[11px] text-[var(--color-text-muted)] mb-1">메모</p>
                  {selectedMember.memo}
                </div>
              )}

              {(selectedMember.sheetManagerMemo || selectedMember.sheetTag || selectedMember.sheetMemberGrade || selectedMember.sheetAcquisitionSource || selectedMember.sheetNextContactDate || selectedMember.sheetAssignedManager) && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded text-[12.5px] text-blue-900 leading-relaxed">
                  <p className="text-[11px] text-blue-600 mb-2">Google Sheets 매니저 메타데이터</p>
                  <dl className="space-y-1.5">
                    {selectedMember.sheetTag && <div><dt className="inline text-blue-600">태그: </dt><dd className="inline">{selectedMember.sheetTag}</dd></div>}
                    {selectedMember.sheetMemberGrade && <div><dt className="inline text-blue-600">등급: </dt><dd className="inline">{selectedMember.sheetMemberGrade}</dd></div>}
                    {selectedMember.sheetAcquisitionSource && <div><dt className="inline text-blue-600">유입: </dt><dd className="inline">{selectedMember.sheetAcquisitionSource}</dd></div>}
                    {selectedMember.sheetNextContactDate && <div><dt className="inline text-blue-600">다음 컨택: </dt><dd className="inline">{selectedMember.sheetNextContactDate}</dd></div>}
                    {selectedMember.sheetAssignedManager && <div><dt className="inline text-blue-600">담당: </dt><dd className="inline">{selectedMember.sheetAssignedManager}</dd></div>}
                    {selectedMember.sheetManagerMemo && <div><dt className="block text-blue-600 mb-0.5">매니저 메모</dt><dd className="whitespace-pre-wrap">{selectedMember.sheetManagerMemo}</dd></div>}
                  </dl>
                </div>
              )}
            </div>

            {/* Passes */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">
                  수강권 <span className="text-[var(--color-text-muted)] font-normal">{memberDetail.passes.length}건</span>
                </h3>
                <button
                  onClick={() => setShowIssuePass(true)}
                  className="inline-flex items-center gap-1 h-8 px-2.5 text-[12px] text-[var(--color-primary)] border border-[var(--color-primary)]/30 rounded hover:bg-[var(--color-primary)]/10"
                  title="이 회원에게 수강권을 직접 발급합니다"
                >
                  <TicketPlus size={13} />
                  수강권 발급
                </button>
              </div>
              {memberDetail.passes.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded">
                  보유 수강권 없음
                </p>
              ) : (
                <ul className="space-y-2">
                  {memberDetail.passes.map(p => {
                    const daysLeft = getDaysUntilExpiry(p);
                    return (
                      <li key={p.id} className="border border-[var(--color-border)] rounded p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[13px] font-medium text-[var(--color-text)]">{p.productName}</p>
                          <Badge tone={p.status === 'active' ? 'success' : 'muted'}>
                            {passStatusConfig[p.status].label}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[12px] text-[var(--color-text-muted)] tabular-nums">
                          <span>
                            {p.category === 'count'
                              ? `잔여 ${p.remainingCount}/${p.totalCount}회`
                              : p.category === 'season' ? '시즌권' : '월권'}
                          </span>
                          <span className={p.status === 'active' && daysLeft <= 7 ? 'text-[var(--color-danger)]' : ''}>
                            {formatKoreanDate(p.expiryDate, 'M.d')} 만료
                            {p.status === 'active' && ` · D-${daysLeft}`}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Reservation history */}
            <div className="p-5">
              <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] mb-3">
                최근 예약/출석 <span className="text-[var(--color-text-muted)] font-normal">최근 8건</span>
              </h3>
              {memberDetail.reservations.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded">
                  이력 없음
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border)] rounded overflow-hidden">
                  {memberDetail.reservations.slice(0, 8).map(r => {
                    if (!r.session) return null;
                    const config = sessionTypeConfig[r.session.type];
                    const statusConf = reservationStatusConfig[r.status];
                    return (
                      <li key={r.id} className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                          <div className="min-w-0">
                            <p className="text-[12.5px] text-[var(--color-text)] truncate">{r.session.name}</p>
                            <p className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                              {formatKoreanDate(r.session.date, 'M.d (EEE)')} {r.session.startTime}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11.5px] shrink-0 ml-2" style={{ color: statusConf.color }}>
                          {statusConf.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 수강권 발급 모달 — 회원관리에서 선택한 회원에게 직접 발급 (회원 고정) */}
      {showIssuePass && selectedMember && (
        <IssuePassModal
          members={members}
          products={passProducts}
          existingPasses={memberPasses}
          lockedMemberId={selectedMember.id}
          onClose={() => setShowIssuePass(false)}
          onIssue={async (memberId, productId, opts) => {
            const r = await issueMemberPass(memberId, productId, opts);
            if (r) {
              setShowIssuePass(false);
              const p = passProducts.find(x => x.id === productId);
              toast.success('수강권을 발급했습니다', `${selectedMember.name}님에게 ${p?.name ?? '수강권'}을(를) 발급했어요.`);
            }
          }}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <Modal title="회원 등록" onClose={() => setShowAdd(false)} size="sm">
          <div className="space-y-4">
            <FormField label="이름" required>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="홍길동" className="form-input" />
            </FormField>
            <FormField label="연락처" required>
              <input type="tel" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="010-0000-0000" className="form-input" />
            </FormField>
            <FormField label="이메일" hint="선택">
              <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@example.com" className="form-input" />
            </FormField>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 text-[13px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-hover)]">
                취소
              </button>
              <button
                onClick={handleAddMember}
                disabled={!formName.trim() || !formPhone.trim()}
                className={cn(
                  "flex-1 py-2 text-[13px] rounded transition-colors",
                  formName.trim() && formPhone.trim()
                    ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
                    : "bg-[var(--color-bg-hover)] text-[var(--color-text-disabled)] cursor-not-allowed"
                )}
              >
                등록
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Temporary password modal — shown right after registration / reset.
          The plaintext password lives only in this dialog; once the admin
          closes it the value is gone forever (DB stores only the bcrypt hash). */}
      {tempPwInfo && (
        <Modal title="임시 비밀번호" onClose={() => setTempPwInfo(null)} size="sm">
          <div className="space-y-4">
            <div className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              <span className="font-semibold text-[var(--color-text)]">{tempPwInfo.memberName}</span>
              {' '}회원에게 아래 임시 비밀번호를 안전한 경로(카카오톡/문자 등)로 전달하세요.
              <br />
              <span className="text-[12px] text-[var(--color-danger)]">
                이 창을 닫은 뒤에는 다시 확인할 수 없습니다. 잃어버린 경우 다시 [비밀번호 초기화]를 눌러야 합니다.
              </span>
            </div>

            <div className="flex items-center gap-2 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded">
              <code className="flex-1 text-[15px] font-mono tabular-nums text-[var(--color-text)] tracking-wider select-all break-all">
                {tempPwInfo.tempPassword}
              </code>
              <button
                onClick={copyTempPassword}
                className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 text-[12px] rounded border border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              >
                <Copy size={12} />
                복사
              </button>
            </div>

            <div className="text-[11.5px] text-[var(--color-text-muted)] leading-relaxed">
              · 첫 로그인 시 비밀번호 변경이 강제됩니다.<br />
              · 회원의 기존 로그인 세션은 모두 즉시 무효화됩니다.<br />
              · 비밀번호는 단방향 해시로만 저장되어 관리자도 평문을 볼 수 없습니다.
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setTempPwInfo(null)}
                className="h-9 px-4 text-[13px] rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
              >
                확인
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
