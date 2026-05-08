'use client';

import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';
import type { ComponentProps } from 'react';

/**
 * Project-toned Sonner Toaster.
 * - position: top-center (mobile-friendly)
 * - radius: 8px (matches project --color-border tone)
 * - color tokens via CSS variables defined in globals.css
 */
export function Toaster(props: ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      theme="light"
      position="top-center"
      richColors
      closeButton
      duration={3500}
      toastOptions={{
        classNames: {
          toast:
            'group toast !rounded-lg !border !border-[var(--color-border)] !bg-white !text-[var(--color-text)] !shadow-lg !text-[13px]',
          description: '!text-[var(--color-text-secondary)] !text-[12px]',
          actionButton:
            '!bg-[var(--color-primary)] !text-white !rounded-md !text-[12px] !px-2 !py-1',
          cancelButton:
            '!bg-[var(--color-bg-subtle)] !text-[var(--color-text-secondary)] !rounded-md !text-[12px] !px-2 !py-1',
          success:
            '!border-[var(--color-success-border)] !bg-[var(--color-success-bg)] !text-[var(--color-success)]',
          error:
            '!border-[var(--color-danger-border)] !bg-[var(--color-danger-bg)] !text-[var(--color-danger)]',
          warning:
            '!border-[var(--color-warning-border)] !bg-[var(--color-warning-bg)] !text-[var(--color-warning)]',
          info:
            '!border-[var(--color-primary-border)] !bg-[var(--color-primary-bg)] !text-[var(--color-primary)]',
        },
      }}
      {...props}
    />
  );
}

export { sonnerToast as toast };
