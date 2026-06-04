'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link2, Loader2, Check, Clock, Bell, Plug, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { INTEGRATION_PRINCIPLE_NOTE } from '@/lib/policy';

type Account = {
  provider: string; name: string; category: string; color: string; desc: string;
  availability: 'available' | 'coming_soon';
  connected: boolean; status: string | null; lastSyncedAt: string | null;
};

const CATEGORY_LABEL: Record<string, string> = { run: '러닝', health: '건강', glucose: '혈당' };

export default function IntegrationsPanel({ filterCategory }: { filterCategory?: 'run' | 'health' | 'glucose' }) {
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

  const visible = filterCategory
    ? accounts.filter(a => a.category === filterCategory)
    : accounts;

  const connect = async (a: Account) => {
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
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-700">
                            <Check size={12} /> 연동됨
                          </span>
                          <button onClick={() => disconnect(a)} disabled={busy === a.provider}
                            className="text-[11.5px] text-[var(--color-text-muted)] hover:text-rose-600">연동 해제</button>
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
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-full px-2.5 py-1 disabled:opacity-50">
                          {busy === a.provider ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />} 연동하기
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
