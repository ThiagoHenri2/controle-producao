import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra spinner e desabilita o botão (use durante mutations). */
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'bg-surface text-slate-900 border border-slate-300 hover:bg-slate-50 active:bg-slate-100',
  danger: 'bg-danger text-danger-foreground hover:bg-danger-hover active:bg-danger-hover',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200',
};

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-touch px-4 text-base',
  lg: 'min-h-[52px] px-5 text-lg',
  icon: 'min-h-touch min-w-touch p-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
    </button>
  );
});
