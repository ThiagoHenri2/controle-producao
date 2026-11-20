import { useId } from 'react';
import { cn } from '@/lib/cn';

export type SwitchProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto de apoio abaixo do rótulo. */
  description?: string;
  disabled?: boolean;
  className?: string;
};

/** Liga/desliga acessível (`role="switch"`). A linha inteira tem ≥ 44px de altura. */
export function Switch({
  label,
  checked,
  onChange,
  description,
  disabled = false,
  className,
}: SwitchProps) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className={cn('flex min-h-touch items-center justify-between gap-3', className)}>
      <div className="flex flex-col">
        <span id={labelId} className="text-sm font-medium text-slate-700">
          {label}
        </span>
        {description && (
          <span id={descId} className="text-sm text-slate-600">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cn(
            'relative inline-block h-7 w-12 rounded-full transition-colors',
            checked ? 'bg-primary' : 'bg-slate-400',
          )}
        >
          <span
            className={cn(
              'absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
    </div>
  );
}
