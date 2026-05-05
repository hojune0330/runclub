'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

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

// ─── Modal ───
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
  const maxW = size === 'sm' ? 'max-w-[400px]' : size === 'lg' ? 'max-w-[640px]' : 'max-w-[480px]';
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4 animate-fade-in" onClick={onClose}>
      <div
        className={cn("bg-white border border-[var(--color-border)] rounded-md shadow-lg w-full animate-slide-up", maxW)}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-[15px] font-semibold text-[var(--color-text)]">{title}</h3>
          <button onClick={onClose} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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

// ─── Tabs ───
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
    <div className="flex border-b border-[var(--color-border)]">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative px-4 py-2.5 text-[13px] transition-colors",
            active === t.id
              ? "text-[var(--color-text)] font-medium"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            {t.label}
            {typeof t.count === 'number' && (
              <span className={cn(
                "text-[11px] px-1.5 py-0.5 rounded tabular-nums",
                active === t.id ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)]" : "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]"
              )}>
                {t.count}
              </span>
            )}
          </span>
          {active === t.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary)]" />
          )}
        </button>
      ))}
    </div>
  );
}
