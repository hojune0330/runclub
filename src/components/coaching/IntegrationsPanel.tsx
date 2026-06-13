'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link2, Loader2, Check, Clock, Bell, Plug, Info, RefreshCw, Upload, FileUp, X, HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { INTEGRATION_PRINCIPLE_NOTE } from '@/lib/policy';

type FileImport = { accept: string; howto: string };
type AutomationInfo = {
  mode: 'oauth_live' | 'business_review' | 'native_app' | 'partner_api';
  label: string;
  checklist: string[];
};
type ProviderReadiness = {
  configured: boolean;
  env: string[];
  redirectUri: string | null;
  note: string;
};
type Account = {
  provider: string; name: string; category: string; color: string; desc: string;
  availability: 'available' | 'coming_soon'; oauth?: boolean;
  automation?: AutomationInfo | null; readiness?: ProviderReadiness | null;
  fileImport?: FileImport | null;
  connected: boolean; status: string | null; lastSyncedAt: string | null;
};

type AppleBridgeToken = {
  id: string;
  token: string;
  endpoint: string;
  note: string;
  samplePayload: unknown;
};

const CATEGORY_LABEL: Record<string, string> = { run: '러닝', health: '건강', glucose: '혈당' };
const IMPORT_MAX_UPLOAD_MB = 30;
const IMPORT_MAX_UPLOAD_BYTES = IMPORT_MAX_UPLOAD_MB * 1024 * 1024;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function IntegrationsPanel({ filterCategory, classId }: { filterCategory?: 'run' | 'health' | 'glucose'; classId?: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 파일 가져오기 모달 대상(애플 건강/가민)
  const [importTarget, setImportTarget] = useState<Account | null>(null);
  const [appleBridge, setAppleBridge] = useState<AppleBridgeToken | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.integrations.list();
      setAccounts(res.accounts);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // OAuth 콜백 결과(?strava=connected / ?garmin=review_required) 처리: 토스트 + 새로고침
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const strava = sp.get('strava');
    const garmin = sp.get('garmin');
    if (!strava && !garmin) return;
    const stravaMsg: Record<string, string> = {
      connected: 'Strava 연동이 완료됐어요! 최근 활동을 불러왔어요.',
      cancelled: 'Strava 연동을 취소했어요.',
      error: 'Strava 연동 중 문제가 발생했어요. 다시 시도해주세요.',
      unavailable: 'Strava 연동이 아직 활성화되지 않았어요.',
      state_expired: 'Strava 인증 시간이 만료됐어요. 다시 연결해주세요.',
    };
    const garminMsg: Record<string, string> = {
      review_required: 'Garmin 자동 연동은 사업자 심사 승인 후 열립니다. 현재는 파일 가져오기를 사용할 수 있어요.',
    };
    setToast(strava ? stravaMsg[strava] ?? null : garmin ? garminMsg[garmin] ?? null : null);
    void load();
    sp.delete('strava');
    sp.delete('garmin');
    const url = window.location.pathname + (sp.toString() ? `?${sp}` : '');
    window.history.replaceState({}, '', url);
    setTimeout(() => setToast(null), 4000);
  }, [load]);

  const syncStrava = async (a: Account) => {
    setBusy(a.provider);
    try {
      const res = await api.integrations.stravaSync(classId);
      const duplicate = res.duplicate ? ` · 중복 ${res.duplicate}건 건너뜀` : '';
      setToast(`Strava에서 ${res.imported}건을 불러왔어요${duplicate}${res.mileageEarned ? ` (+${res.mileageEarned}P)` : ''}.`);
      await load();
    } catch (e: unknown) { setToast(errorMessage(e, '동기화 실패')); }
    finally { setBusy(null); setTimeout(() => setToast(null), 4000); }
  };

  const visible = filterCategory
    ? accounts.filter(a => a.category === filterCategory)
    : accounts;

  const connect = async (a: Account) => {
    // 실제 OAuth(예: Strava) → 인증 페이지로 이동
    if (a.oauth) {
      window.location.href = api.integrations.stravaStartUrl(classId);
      return;
    }
    setBusy(a.provider);
    try {
      const res = await api.integrations.connect(a.provider);
      setToast(res.message);
      await load();
    } catch (e: unknown) { setToast(errorMessage(e, '실패')); }
    finally { setBusy(null); setTimeout(() => setToast(null), 3500); }
  };

  const disconnect = async (a: Account) => {
    setBusy(a.provider);
    try { await api.integrations.disconnect(a.provider); await load(); }
    catch (e: unknown) { setToast(errorMessage(e, '실패')); }
    finally { setBusy(null); }
  };

  const createAppleBridge = async () => {
    setBusy('apple_health_bridge');
    try {
      const res = await api.integrations.createAppleHealthToken('Apple Health Shortcut');
      setAppleBridge(res);
      setToast('Apple 건강 Shortcut/API 연결 토큰을 만들었어요. 토큰은 한 번만 보여요.');
      await load();
    } catch (e: unknown) { setToast(errorMessage(e, 'Apple 건강 연결 준비 실패')); }
    finally { setBusy(null); setTimeout(() => setToast(null), 5000); }
  };

  return (
    <section className="bg-white border border-[var(--color-border)] rounded-md p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Link2 size={15} className="text-[var(--color-primary)]" />
        <h3 className="text-[14px] font-semibold text-[var(--color-text)]">데이터 연동</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" /></div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map(a => {
            const isComing = a.availability === 'coming_soon';
            const pending = a.status === 'pending';
            return (
              <li key={a.provider} className="rounded-md border border-[var(--color-border-subtle)] p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[var(--color-text)]">{a.name}</span>
                      <span className="text-[10.5px] text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded px-1.5 py-0.5">{CATEGORY_LABEL[a.category] ?? a.category}</span>
                    </div>
                    <p className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{a.desc}</p>
                    <ProviderReadinessNote account={a} />

                    <div className="mt-2.5">
                      {a.connected ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-700">
                              <Check size={12} /> 연동됨
                            </span>
                            <button onClick={() => disconnect(a)} disabled={busy === a.provider}
                              className="text-[11.5px] text-[var(--color-text-muted)] hover:text-rose-600">연동 해제</button>
                          </div>
                          {a.oauth && (
                            <button onClick={() => syncStrava(a)} disabled={busy === a.provider}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-primary)] bg-[var(--color-primary-bg)] rounded-full px-2.5 py-1 hover:opacity-90 disabled:opacity-50">
                              {busy === a.provider ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} 활동 다시 불러오기
                            </button>
                          )}
                          {/* 파일 가져오기 제공자: 연동(파일) 후에도 다시 가져오기 버튼 노출 */}
                          {a.fileImport && (
                            <button onClick={() => setImportTarget(a)} disabled={busy === a.provider}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-primary)] bg-[var(--color-primary-bg)] rounded-full px-2.5 py-1 hover:opacity-90 disabled:opacity-50">
                              <FileUp size={11} /> 파일 다시 가져오기
                            </button>
                          )}
                          {a.provider === 'apple_health' && (
                            <button onClick={createAppleBridge} disabled={busy === 'apple_health_bridge'}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#ff2d55] bg-rose-50 rounded-full px-2.5 py-1 hover:opacity-90 disabled:opacity-50">
                              {busy === 'apple_health_bridge' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Shortcut/API 연결 토큰
                            </button>
                          )}
                          {a.lastSyncedAt && (
                            <p className="text-[10.5px] text-[var(--color-text-muted)]">최근 가져오기: {new Date(a.lastSyncedAt).toLocaleString('ko-KR')}</p>
                          )}
                        </div>
                      ) : a.fileImport ? (
                        /* 애플 건강·가민: 파일 가져오기가 "지금 바로" 동작하는 1차 액션 */
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => setImportTarget(a)} disabled={busy === a.provider}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-white rounded-full px-2.5 py-1 hover:opacity-90 disabled:opacity-50"
                              style={{ background: a.color }}>
                              <FileUp size={11} /> 파일로 가져오기
                            </button>
                            {a.provider === 'apple_health' && (
                              <button onClick={createAppleBridge} disabled={busy === 'apple_health_bridge'}
                                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#ff2d55] bg-rose-50 border border-rose-100 rounded-full px-2.5 py-1 hover:bg-rose-100 disabled:opacity-50">
                                {busy === 'apple_health_bridge' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Shortcut/API beta
                              </button>
                            )}
                          </div>
                          {pending ? (
                            <p className="text-[10.5px] text-amber-700 inline-flex items-center gap-1">
                              <Bell size={10} /> 자동 동기화 오픈 알림 신청됨
                            </p>
                          ) : (
                            <button onClick={() => connect(a)} disabled={busy === a.provider}
                              className="block text-[10.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                              자동 동기화 오픈 시 알림받기
                            </button>
                          )}
                        </div>
                      ) : pending ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700">
                            <Bell size={12} /> 오픈 알림 신청됨
                          </span>
                          <button onClick={() => disconnect(a)} disabled={busy === a.provider}
                            className="text-[11.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">취소</button>
                        </div>
                      ) : isComing ? (
                        <button onClick={() => connect(a)} disabled={busy === a.provider}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 disabled:opacity-50">
                          {busy === a.provider ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />} 오픈 시 알림받기
                        </button>
                      ) : (
                        <button onClick={() => connect(a)} disabled={busy === a.provider}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-white rounded-full px-2.5 py-1 disabled:opacity-50 hover:opacity-90"
                          style={a.oauth ? { background: a.color } : { background: 'var(--color-primary)' }}>
                          {busy === a.provider ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />} {a.oauth ? `${a.name}로 연동` : '연동하기'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11.5px] text-[var(--color-text-muted)] flex items-start gap-1">
        <Info size={12} className="mt-0.5 shrink-0" /> {INTEGRATION_PRINCIPLE_NOTE}
      </p>

      {toast && (
        <div className="text-[12px] text-[var(--color-primary)] bg-[var(--color-primary-bg)] rounded-md px-3 py-2">{toast}</div>
      )}

      {importTarget && (
        <FileImportModal
          account={importTarget}
          classId={classId}
          onClose={() => setImportTarget(null)}
          onDone={(msg) => { setImportTarget(null); setToast(msg); void load(); setTimeout(() => setToast(null), 6000); }}
        />
      )}

      {appleBridge && <AppleBridgeModal bridge={appleBridge} onClose={() => setAppleBridge(null)} />}
    </section>
  );
}

function AppleBridgeModal({ bridge, onClose }: { bridge: AppleBridgeToken; onClose: () => void }) {
  const sample = JSON.stringify(bridge.samplePayload, null, 2);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); } catch { /* clipboard optional */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Apple 건강 Shortcut/API beta</h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
              Apple 건강은 웹 OAuth가 없어서, iPhone 단축어 또는 향후 iOS 앱이 아래 endpoint로 운동 기록을 보내는 방식으로 바로 연결합니다. 토큰은 이 화면에서 한 번만 보여요.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1"><X size={18} /></button>
        </div>

        <div className="space-y-2">
          <CopyBlock label="Endpoint" value={bridge.endpoint} onCopy={copy} />
          <CopyBlock label="Bearer token" value={bridge.token} onCopy={copy} secret />
        </div>

        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] p-3">
          <p className="text-[12px] font-medium text-[var(--color-text)]">iPhone 단축어 설정 요약</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] leading-relaxed text-[var(--color-text-secondary)]">
            <li>건강 샘플/운동 기록을 가져오는 단축어를 만듭니다.</li>
            <li>URL을 위 Endpoint로 두고, 방법은 POST, 본문은 JSON으로 설정합니다.</li>
            <li>Header에 <span className="font-mono">Authorization: Bearer 위_토큰</span>을 넣습니다.</li>
            <li>아래 예시처럼 <span className="font-mono">activities</span> 배열을 전송합니다.</li>
          </ol>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-[var(--color-text)]">JSON 예시</p>
            <button onClick={() => copy(sample)} className="text-[11.5px] text-[var(--color-primary)]">복사</button>
          </div>
          <pre className="max-h-52 overflow-auto rounded-md bg-[#111827] p-3 text-[10.5px] leading-relaxed text-white">{sample}</pre>
        </div>

        <p className="text-[10.5px] leading-relaxed text-amber-700">
          주의: 토큰은 비밀번호처럼 보관하세요. 노출되면 Apple 건강 연동을 해제해 기존 토큰을 폐기한 뒤 새 토큰을 발급하세요.
        </p>
      </div>
    </div>
  );
}

function CopyBlock({ label, value, onCopy, secret = false }: { label: string; value: string; onCopy: (value: string) => void; secret?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--color-border-subtle)] p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{label}</span>
        <button onClick={() => onCopy(value)} className="text-[11.5px] text-[var(--color-primary)]">복사</button>
      </div>
      <p className="break-all font-mono text-[11px] text-[var(--color-text)]">{secret ? value.replace(/^(.{16}).+(.{6})$/, '$1…$2') : value}</p>
    </div>
  );
}

function ProviderReadinessNote({ account }: { account: Account }) {
  if (!account.automation && !account.readiness) return null;
  const configured = account.readiness?.configured;
  return (
    <details className="mt-2 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)] px-2.5 py-2">
      <summary className="cursor-pointer text-[10.5px] font-medium text-[var(--color-text-secondary)]">
        {configured ? '실제 자동 연동 준비됨' : account.automation?.label ?? '자동 연동 준비 정보'}
      </summary>
      <div className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-[var(--color-text-muted)]">
        {account.readiness?.note && <p>{account.readiness.note}</p>}
        {account.readiness?.redirectUri && (
          <p className="break-all font-mono text-[10px] text-[var(--color-text-secondary)]">Callback: {account.readiness.redirectUri}</p>
        )}
        {account.automation?.checklist && account.automation.checklist.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4">
            {account.automation.checklist.map(item => <li key={item}>{item}</li>)}
          </ul>
        )}
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FileImportModal — 애플 건강(export.zip) / 가민(tcx·gpx·zip) 파일 업로드.
// 정직한 UX: "왜 파일인가" 안내 + 만드는 법(howto) + 업로드 + 결과 요약.
// ─────────────────────────────────────────────────────────────────────
function FileImportModal({
  account, classId, onClose, onDone,
}: {
  account: Account;
  classId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = account.fileImport?.accept ?? '.zip,.xml,.tcx,.gpx';

  const submit = async () => {
    if (!file) { setError('파일을 선택해주세요'); return; }
    if (file.size > IMPORT_MAX_UPLOAD_BYTES) {
      setError(`파일이 너무 커요. ${IMPORT_MAX_UPLOAD_MB}MB 이하로, 최근 3~6개월 단위로 나눠서 올려주세요.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const res = await api.integrations.importFile(account.provider as 'apple_health' | 'garmin', file, classId);
      if (res.imported === 0 && res.duplicate === 0) {
        setError(res.message || '가져올 운동 기록을 찾지 못했어요. 올바른 내보내기 파일인지 확인해주세요.');
        setUploading(false);
        return;
      }
      const parts = [`${res.imported}건 가져옴`];
      if (res.duplicate) parts.push(`중복 ${res.duplicate}건 건너뜀`);
      if (res.mileageEarned) parts.push(`+${res.mileageEarned}P`);
      if (res.truncated) parts.push('(많아서 일부만 처리—나눠서 다시 올려주세요)');
      if (res.jobId) parts.push(`작업 ${res.jobId.slice(-6)}`);
      onDone(`${account.name}에서 ${parts.join(' · ')}`);
    } catch (e: unknown) {
      setError(errorMessage(e, '가져오기에 실패했어요'));
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: account.color }}>
              <FileUp size={16} />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--color-text)]">{account.name} 파일 가져오기</h3>
              <p className="text-[11.5px] text-[var(--color-text-muted)]">내보낸 파일을 올리면 운동 기록을 가져와요</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1"><X size={18} /></button>
        </div>

        {/* 왜 파일인가 + 만드는 법 */}
        <div className="rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border-subtle)] p-3 space-y-2">
          <p className="text-[12px] text-[var(--color-text-secondary)] flex items-start gap-1.5">
            <HelpCircle size={13} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
            <span>{account.name}은 보안 정책상 웹 자동 연동이 제한돼요. 대신 내보내기 파일로 안전하게 가져올 수 있어요.</span>
          </p>
          {account.fileImport?.howto && (
            <p className="text-[12px] text-[var(--color-text)] leading-relaxed pl-[18px]">
              {account.fileImport.howto}
            </p>
          )}
        </div>

        {/* 파일 선택 영역 */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'w-full rounded-lg border-2 border-dashed p-5 text-center transition-colors',
            file ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
          )}
        >
          <Upload size={22} className={cn('mx-auto mb-1.5', file ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]')} />
          {file ? (
            <p className="text-[12.5px] font-medium text-[var(--color-text)] break-all">{file.name}
              <span className="block text-[11px] text-[var(--color-text-muted)] font-normal mt-0.5">{(file.size / 1024 / 1024).toFixed(1)}MB · 다른 파일 선택하려면 클릭</span>
            </p>
          ) : (
            <p className="text-[12.5px] text-[var(--color-text-muted)]">파일 선택 ({accept}) · 최대 {IMPORT_MAX_UPLOAD_MB}MB</p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const nextFile = e.target.files?.[0] ?? null;
              setFile(nextFile);
              setError(nextFile && nextFile.size > IMPORT_MAX_UPLOAD_BYTES
                ? `파일이 너무 커요. ${IMPORT_MAX_UPLOAD_MB}MB 이하로, 최근 3~6개월 단위로 나눠서 올려주세요.`
                : null);
            }}
          />
        </button>

        {error && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 h-11 text-[13px] font-medium text-[var(--color-text)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-subtle)] disabled:opacity-50">
            닫기
          </button>
          <button onClick={submit} disabled={uploading || !file}
            className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white bg-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)]">
            {uploading ? <><Loader2 size={14} className="animate-spin" /> 가져오는 중…</> : <><FileUp size={14} /> 가져오기</>}
          </button>
        </div>

        <p className="text-[10.5px] text-[var(--color-text-muted)] text-center leading-relaxed">
          업로드한 파일은 가져오기에만 사용하고 저장하지 않아요. 안정성을 위해 {IMPORT_MAX_UPLOAD_MB}MB 이하, 최근 3~6개월 단위 업로드를 권장해요. 같은 기록은 자동으로 중복 제거돼요.
        </p>
      </div>
    </div>
  );
}
