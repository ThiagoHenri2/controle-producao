import { useId } from 'react';
import { cn } from '@/lib/cn';
import { formatBRL, fromCentavos, rotuloData } from '@/lib/format';
import type { DiaSaldo } from '../saldo';

type ResumoDiasSaldoProps = { dias: readonly DiaSaldo[] };

/** "Por dia" do Ambos (spec 009): receitas, despesas e saldo de cada data. */
export function ResumoDiasSaldo({ dias }: ResumoDiasSaldoProps) {
  const titleId = useId();
  const agora = new Date();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-bold text-slate-900">
        Por dia
      </h2>
      <ul
        aria-labelledby={titleId}
        className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm"
      >
        {dias.map((d) => (
          <li key={d.data} className="flex min-h-touch flex-col gap-0.5 px-4 py-2">
            <div className="flex items-baseline gap-2">
              <time dateTime={d.data} className="flex-1 font-medium text-slate-900">
                {rotuloData(d.data, agora)}
              </time>
              <span
                className={cn(
                  'shrink-0 font-semibold tabular-nums',
                  d.saldo < 0 ? 'text-red-700' : 'text-slate-900',
                )}
                data-testid="dia-saldo"
              >
                {formatBRL(fromCentavos(d.saldo))}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-x-3 text-sm tabular-nums">
              <span className="text-green-700" data-testid="dia-receitas">
                <span className="sr-only">Receitas </span>+{formatBRL(fromCentavos(d.receitas))}
              </span>
              <span className="text-red-700" data-testid="dia-despesas">
                <span className="sr-only">Despesas </span>−{formatBRL(fromCentavos(d.despesas))}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
