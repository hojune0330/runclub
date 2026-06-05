'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link2, Loader2, Check, Clock, Bell, Plug, Info, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { INTEGRATION_PRINCIPLE_NOTE } from '@/lib/policy';

type Account = {
  provider: string; name: string; category: string; color: string; desc: string;
  availability: 'available' | 'coming_soon'; oauth?: boolean;
  connected: boolean; status: string | null; lastSyncedAt: string | null;
};

const CATEGORY_LABEL: Record<string, string> = { run: '러닝', health: '건강', glucose: '혈당' };

export default function IntegrationsPanel({ filterCategory, classId }: { filterCategory?: 'run' | 'health' | 'glucose'; classId?: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.integrations.list();
      setAccounts(res.accounts);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Strava 콜백 결과(?strava=connected) 처리: 토스트 + 새로고침
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get('strava');
    if (!s) return;
    const msg: Record<string, string> = {
      connected: 'Strava 연동이 완료됐어요! 최근 활동을 불러왔어요.',
      cancelled: 'Strava 연동을 취소했어요.',
      error: 'Strava 연동 중 문제가 발생했어요. 다시 시도해주세요.',
      unavailable: 'Strava 연동이 아직 활성화되지 않았어요.',
    };
    setToast(msg[s] ?? null);
    void load();
    sp.delete('strava');
    const url = window.location.pathname + (sp.toString() ? `?${sp}` : '');
    window.history.replaceState({}, '', url);
    setTimeout(() => setToast(null), 4000);
  }, [load]);

  const syncStrava = async (a: Account) => {
    setBusy(a.provider);
    try {
      const res = await api.integrations.stravaSync(classId);
      setToast(`Strava에서 ${res.imported}건을 불러왔어요${res.mileageEarned ? ` (+${res.mileageEarned}P)` : ''}.`);
      await load();
    } catch (e: any) { setToast(e?.message ?? '동기화 실패'); }
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
    } catch (e: any) { setToast(e?.message ?? '실패'); }
    finally { setBusy(null); setTimeout(() => setToast(null), 3500); }
  };

  const disconnect = async (a: Account) => {
    setBusy(a.provider);
    try { await api.integrations.disconnect(a.provider); await load(); }
    catch (e: any) { setToast(e?.message ?? '실패'); }
    finally { setBusy(null); }
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
                          {a.lastSyncedAt && (
                            <p className="text-[10.5px] text-[var(--color-text-muted)]">최근 동기화: {new Date(a.lastSyncedAt).toLocaleString('ko-KR')}</p>
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
    </section>
  );
}
