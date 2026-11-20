import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 bg-surface p-4 shadow-sm', className)}
      {...rest}
    />
  );
}
