import { useId, useState, type ChangeEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Esconde visualmente o rótulo (continua acessível a leitores de tela). */
  hideLabel?: boolean;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Quantidade inteira com botões −/+ e campo numérico. Mínimo padrão 0. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  disabled = false,
  hideLabel = false,
  className,
}: StepperProps) {
  const id = useId();
  // Texto em edição: permite apagar o campo sem que ele vire "0" na hora.
  const [draft, setDraft] = useState<string | null>(null);

  const set = (n: number) => onChange(clamp(n, min, max));

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') {
      setDraft('');
      set(min);
      return;
    }
    const n = clamp(Number(digits), min, max);
    setDraft(String(n));
    set(n);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cn('text-sm font-medium text-slate-700', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40"
          aria-label={`Diminuir ${label}`}
          onClick={() => {
            setDraft(null);
            set(value - step);
          }}
          disabled={disabled || value <= min}
        >
          <Minus className="h-5 w-5" aria-hidden />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className="h-11 w-16 min-w-0 rounded-lg border border-slate-300 bg-surface text-center text-lg font-semibold tabular-nums text-slate-900 disabled:bg-slate-100"
          value={draft ?? String(value)}
          onChange={handleInput}
          onFocus={(e) => e.target.select()}
          onBlur={() => setDraft(null)}
          disabled={disabled}
        />
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover disabled:opacity-40"
          aria-label={`Aumentar ${label}`}
          onClick={() => {
            setDraft(null);
            set(value + step);
          }}
          disabled={disabled || value >= max}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
