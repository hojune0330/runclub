'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Project-toned Radix Tabs primitives.
 *
 * 프로젝트 톤(--color-* 변수, 하단 인디케이터 형태)에 맞춰 1차 매핑한
 * shadcn 스타일 Tabs. in-house <Tabs tabs active onChange /> 컴포넌트가
 * 이 프리미티브 위에 올라가는 호환 래퍼다.
 *
 * 자연스럽게 얻는 것:
 * - 좌우 화살표 키 네비게이션
 * - role="tablist" / role="tab" / role="tabpanel" 자동 주입
 * - aria-selected / aria-controls 연결
 */

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('flex border-b border-[var(--color-border)]', className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative px-4 py-2.5 text-[13px] transition-colors',
      'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
      'data-[state=active]:text-[var(--color-text)] data-[state=active]:font-medium',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1 rounded-sm',
      // 활성 시 하단 인디케이터
      'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--color-primary)] after:opacity-0',
      'data-[state=active]:after:opacity-100',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('focus:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
