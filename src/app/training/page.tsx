import Link from 'next/link';
import { ArrowRight, Activity, Repeat, Database, Brain, FileText, type LucideIcon } from 'lucide-react';
import PublicLayout from '@/components/public/PublicLayout';

const ORACLE_BRAND = '#0D5F5A';
const HAIR = '#E8E6DF';

const steps = [
  { no: '§1', title: 'Training log', desc: '러닝, 컨디션, 건강 신호를 한 곳에 기록합니다.', code: 'LOG', color: '#4A8FC7' },
  { no: '§2', title: '9.5-day cycle', desc: 'MAIN / BASE / LT / REST 흐름으로 훈련 맥락을 잡습니다.', code: 'CYC', color: '#B8A024' },
  { no: '§3', title: 'Data source', desc: 'Strava, Garmin, Apple Health 같은 출처를 남깁니다.', code: 'SRC', color: '#0D5F5A' },
  { no: '§4', title: 'Coach judgement', desc: 'AI보다 먼저 기록의 근거와 코치 판단을 분리합니다.', code: 'JDG', color: '#C7761C' },
];

export default function PublicTrainingPage() {
  return (
    <PublicLayout>
      <section className="bg-white">
        <div className="mx-auto max-w-[1100px] px-5 py-12 md:px-6 md:py-20">
          <div className="max-w-[720px]">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: ORACLE_BRAND }}>
              Training Hub · powered by Train Oracle
            </p>
            <h1 className="mt-3 text-[30px] font-bold leading-[1.2] tracking-[-0.025em] text-[var(--color-text)] md:text-[46px]">
              기록을 남기고,
              <br />
              다음 훈련의 근거를 만듭니다.
            </h1>
            <p className="mt-5 text-[14.5px] leading-relaxed text-[var(--color-text-secondary)] md:text-[17px]">
              트레이닝 허브는 독립 앱 Train Oracle의 가벼운 입구입니다. 이곳에서는 러닝 기록, 9.5일 사이클, 데이터 출처 같은 핵심 맥락만 먼저 사용합니다.
            </p>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Link href="/login?mode=register" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-6 text-[14.5px] font-semibold text-white hover:bg-[var(--color-primary-hover)]">
                트레이닝 기록 시작하기 <ArrowRight size={15} />
              </Link>
              <Link href="/sessions" className="inline-flex h-12 items-center justify-center px-2 text-[14px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                먼저 세션 일정 보기 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-[var(--color-bg-subtle)]" style={{ borderColor: HAIR }}>
        <div className="mx-auto max-w-[1100px] px-5 py-8 md:px-6 md:py-12">
          <div className="grid gap-0 border bg-white md:grid-cols-4" style={{ borderColor: HAIR }}>
            {steps.map((step, index) => (
              <div key={step.code} className="border-b border-r p-4 md:border-b-0 md:last:border-r-0" style={{ borderColor: HAIR }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{step.no}</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[var(--color-text-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: step.color }} />
                    {step.code}
                  </span>
                </div>
                <h2 className="mt-3 text-[14.5px] font-semibold text-[var(--color-text)]">{step.title}</h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">{step.desc}</p>
                {index === 2 && <p className="mt-2 font-mono text-[10.5px] text-[var(--color-text-muted)]">Garmin / Strava / Apple Health</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-[1100px] gap-4 px-5 py-12 md:grid-cols-[1fr_0.9fr] md:px-6 md:py-16">
          <div className="border p-5" style={{ borderColor: '#D9D6CE' }}>
            <SectionTitle icon={Repeat} no="§5" title="9.5-day cycle context" />
            <div className="mt-5 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {['REC', 'BASE', 'BASE', 'BASE+', 'MAIN', 'REC', 'LT', 'BASE', 'REST', 'TR'].map((code, index) => (
                <div key={`${code}-${index}`} className="border px-2 py-2" style={{ borderColor: HAIR }}>
                  <p className="font-mono text-[10px] text-[var(--color-text-muted)]">D-{index === 9 ? '.5' : index + 1}</p>
                  <p className="mt-1 font-mono text-[10.5px] font-semibold text-[var(--color-text)]">{code}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
              아직은 자동 처방이 아닙니다. 런클럽 앱에서는 기록과 계획의 구조를 익히고, 이후 Train Oracle에서 검증·AI 인박스·근거 리포트로 확장합니다.
            </p>
          </div>

          <div className="border p-5" style={{ borderColor: '#D9D6CE', background: '#FAFAF7' }}>
            <SectionTitle icon={Brain} no="§6" title="Honest AI, later" />
            <div className="mt-4 flex items-center gap-2">
              <span className="border px-2 py-0.5 font-mono text-[11px] font-semibold" style={{ borderColor: ORACLE_BRAND, color: ORACLE_BRAND }}>LACK</span>
              <span className="font-mono text-[11px] text-[var(--color-text-muted)]">confidence 32%</span>
            </div>
            <p className="mt-3 text-[13.5px] font-semibold text-[var(--color-text)]">지금 필요한 것은 분석보다 기록입니다.</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
              Train Oracle의 AI는 확신을 가장하지 않습니다. 데이터가 부족하면 LACK, 신호가 충돌하면 UNC로 표시하고, 다른 관점과 근거를 함께 제공합니다.
            </p>
            <div className="mt-4 border-l-2 pl-3 text-[12px] leading-relaxed text-[var(--color-text-secondary)]" style={{ borderColor: '#0E1412' }}>
              다른 관점: 초보자에게는 정교한 분석보다 꾸준한 기록 습관과 코치 피드백이 먼저입니다.
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-[var(--color-bg-subtle)]" style={{ borderColor: HAIR }}>
        <div className="mx-auto max-w-[1100px] px-5 py-10 md:px-6 md:py-14">
          <div className="grid gap-3 md:grid-cols-3">
            <UseCase icon={Activity} title="참가자" desc="세션과 무관하게 내 훈련 일지를 남기고 흐름을 봅니다." />
            <UseCase icon={Database} title="데이터형 러너" desc="시계·앱 기록을 가져와 출처가 남는 로그로 정리합니다." />
            <UseCase icon={FileText} title="운영자·코치" desc="기록, 과제, 건강 신호를 보고 개입이 필요한 사람을 파악합니다." />
          </div>
          <div className="mt-8">
            <Link href="/login?mode=register" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-6 text-[14.5px] font-semibold text-white hover:bg-[var(--color-primary-hover)]">
              무료로 기록 시작하기 <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function SectionTitle({ icon: Icon, no, title }: { icon: LucideIcon; no: string; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
      <Icon size={16} style={{ color: ORACLE_BRAND }} />
      <span className="font-mono text-[11px] font-medium text-[var(--color-text-muted)]">{no}</span>
      {title}
    </h2>
  );
}

function UseCase({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="border bg-white p-4" style={{ borderColor: '#D9D6CE' }}>
      <Icon size={16} style={{ color: ORACLE_BRAND }} />
      <p className="mt-3 text-[14px] font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">{desc}</p>
    </div>
  );
}
