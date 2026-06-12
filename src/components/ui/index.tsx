'use client';

import { cn } from '@/lib/utils';
import { useMemo, type ReactNode } from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from '@/components/ui/shadcn/sonner';
import {
  Dialog as RadixDialog,
  DialogContent as RadixDialogContent,
  DialogHeader as RadixDialogHeader,
  DialogTitle as RadixDialogTitle,
  DialogDescription as RadixDialogDescription,
  DialogBody as RadixDialogBody,
} from '@/components/ui/shadcn/dialog';
import {
  Tabs as RadixTabs,
  TabsList as RadixTabsList,
  TabsTrigger as RadixTabsTrigger,
} from '@/components/ui/shadcn/tabs';

// ─── Panel ───
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("bg-white border border-[var(--color-border)] rounded-md overflow-hidden", className)}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-white">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
          {action && <div className="text-[12px] text-[var(--color-text-muted)]">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// ─── Modal (Radix Dialog 어댑터) ───
// 기존 호출부 API(<Modal title onClose>{children}</Modal>)를 그대로 유지하고
// 내부 구현만 @radix-ui/react-dialog 기반의 shadcn 톤 Dialog로 위임한다.
// 이 어댑터로 ESC 닫기, focus trap, 스크롤 잠금, aria-* 속성이 자동 적용된다.
export function Modal({
  title,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <RadixDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <RadixDialogContent size={size}>
        <RadixDialogHeader>
          <RadixDialogTitle>{title}</RadixDialogTitle>
        </RadixDialogHeader>
        <RadixDialogBody>{children}</RadixDialogBody>
      </RadixDialogContent>
    </RadixDialog>
  );
}

// ─── FormField ───
export function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-medium text-[var(--color-text-secondary)]">
          {label}
          {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[11.5px] text-[var(--color-text-muted)]">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Button ───
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium rounded transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === 'sm' ? "text-[12px] px-2.5 py-1" : "text-[13px] px-3.5 py-2",
        variant === 'primary' && "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]",
        variant === 'secondary' && "bg-white text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]",
        variant === 'danger' && "bg-white text-[var(--color-danger)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg)]",
        variant === 'ghost' && "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── ConfirmDialog ───
// 브라우저 기본 confirm() 대신 Radix Dialog 기반으로 확인 UX를 통일한다.
// 포커스 트랩/ESC/aria 처리는 Dialog 어댑터가 담당하고, 호출부는 의미와 액션만 넘긴다.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'primary',
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <RadixDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <RadixDialogContent size="sm" showCloseButton={!busy}>
        <RadixDialogHeader>
          <RadixDialogTitle>{title}</RadixDialogTitle>
        </RadixDialogHeader>
        <RadixDialogBody>
          {description && (
            <RadixDialogDescription className="leading-relaxed">
              {description}
            </RadixDialogDescription>
          )}
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={busy}
              className="sm:min-w-[76px]"
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={onConfirm}
              disabled={busy}
              className="sm:min-w-[88px]"
            >
              {busy ? '처리 중…' : confirmLabel}
            </Button>
          </div>
        </RadixDialogBody>
      </RadixDialogContent>
    </RadixDialog>
  );
}

// ─── Badge ───
type BadgeTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';
export function Badge({ tone = 'default', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[11.5px] font-medium border",
        tone === 'default' && "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
        tone === 'primary' && "bg-[var(--color-primary-bg)] text-[var(--color-primary)] border-[var(--color-primary-border)]",
        tone === 'success' && "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]",
        tone === 'warning' && "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]",
        tone === 'danger' && "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]",
        tone === 'muted' && "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] border-transparent",
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── EmptyState ───
export function EmptyState({
  message,
  description,
  action,
  className,
}: {
  message: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-12 text-center", className)}>
      <p className="text-[13.5px] text-[var(--color-text-secondary)] font-medium">{message}</p>
      {description && <p className="text-[12.5px] text-[var(--color-text-muted)] mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Skeleton ───
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 && lines > 1 ? '70%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("skeleton skeleton-card", className)} aria-hidden />;
}

// ─── Page-shaped skeletons (route-level loading) ───
// 첫 진입 시 단순 스피너 대신 실제 화면 레이아웃과 닮은 형태를 보여줘
// "곧 무엇이 뜰지" 미리 알려주기 위한 컴포넌트.
export function PageSkeleton({ variant }: { variant: 'admin' | 'member' }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-subtle)]">
      {/* Top bar */}
      <div className="bg-white border-b border-[var(--color-border)]">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-16 hidden sm:block" />
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-4 space-y-4">
        {/* Page title */}
        <Skeleton className="h-6 w-40" />

        {/* KPI strip */}
        <div className={variant === 'admin' ? 'kpi-grid-4' : 'kpi-grid-4'}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-[var(--color-border)] rounded-md p-3 space-y-2"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>

        {/* Main content area */}
        {variant === 'admin' ? (
          /* admin: table-ish */
          <div className="bg-white border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 flex-1 max-w-[180px]" />
                  <Skeleton className="h-4 w-16 hidden sm:block" />
                  <Skeleton className="h-4 w-12 hidden md:block" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* member: session card list */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white border border-[var(--color-border)] rounded-md p-3 flex items-center gap-3"
                >
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-7 w-16" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="bg-white border border-[var(--color-border)] rounded-md p-3 space-y-2">
                <Skeleton className="h-4 w-20" />
                <SkeletonText lines={3} />
              </div>
              <div className="bg-white border border-[var(--color-border)] rounded-md p-3 space-y-2">
                <Skeleton className="h-4 w-24" />
                <SkeletonText lines={2} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toast (Sonner 어댑터) ───
// 기존 호출부(toast.success/error/info/warning/show) 시그니처를 유지한 채
// 내부 구현만 Sonner로 위임. ToastProvider는 Sonner Toaster를 렌더하는 얇은 래퍼.
type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone; description?: string; duration?: number }) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SonnerToaster />
    </>
  );
}

export function useToast(): ToastApi {
  return useMemo<ToastApi>(() => ({
    show: (message, options) => {
      const tone = options?.tone ?? 'info';
      const opts = {
        description: options?.description,
        duration: options?.duration,
      };
      if (tone === 'success') sonnerToast.success(message, opts);
      else if (tone === 'error') sonnerToast.error(message, opts);
      else if (tone === 'warning') sonnerToast.warning(message, opts);
      else sonnerToast.info(message, opts);
    },
    success: (m, d) => sonnerToast.success(m, { description: d }),
    error: (m, d) => sonnerToast.error(m, { description: d }),
    info: (m, d) => sonnerToast.info(m, { description: d }),
    warning: (m, d) => sonnerToast.warning(m, { description: d }),
  }), []);
}

// 직접 호출용 (컴포넌트 외부에서 쓸 때)
export { sonnerToast as toast };

// ─── Tabs (Radix Tabs 어댑터) ───
// 기존 호출부 API(<Tabs tabs active onChange />)를 그대로 유지하고
// 내부 구현만 @radix-ui/react-tabs 기반의 shadcn 톤 Tabs로 위임한다.
// 이 어댑터로 좌우 화살표 키 네비게이션, role/aria 속성이 자동 적용된다.
//
// 활성 시 하단 인디케이터는 shadcn Tabs 프리미티브의 ::after 의사요소로
// 그려지며, count 배지는 어댑터에서 직접 렌더한다 (data-[state=active]
// CSS 셀렉터로 활성 색을 분기).
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <RadixTabs value={active} onValueChange={(v) => onChange(v as T)}>
      <RadixTabsList>
        {tabs.map((t) => (
          <RadixTabsTrigger key={t.id} value={t.id}>
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {typeof t.count === 'number' && (
                <span
                  className={cn(
                    "text-[11px] px-1.5 py-0.5 rounded tabular-nums",
                    active === t.id
                      ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)]"
                      : "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
                  )}
                >
                  {t.count}
                </span>
              )}
            </span>
          </RadixTabsTrigger>
        ))}
      </RadixTabsList>
    </RadixTabs>
  );
}
