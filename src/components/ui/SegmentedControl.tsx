import { cn } from '@/lib/cn';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  /** Nome acessível do grupo (ex.: "Tipo"). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/**
 * Seletor segmentado (ex.: Receitas | Despesas | Ambos): grupo de botões com
 * `aria-pressed`, cada um com ≥ 44px de altura e largura igual.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-1 rounded-xl border border-slate-200 bg-surface p-1', className)}
    >
      {options.map((o) => {
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-h-touch min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              ativo
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
            )}
          >
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
