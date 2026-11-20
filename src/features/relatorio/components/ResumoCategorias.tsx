import { useId } from 'react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { ResumoCategoria } from '../api';
import { formatInteiro, percentual } from '../format';

type ResumoCategoriasProps = { categorias: ResumoCategoria[]; totalGeral: number };

/** Lista por categoria: quantidade, R$ e barra CSS com o % do total. */
export function ResumoCategorias({ categorias, totalGeral }: ResumoCategoriasProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-bold text-slate-900">
        Por categoria
      </h2>
      <ul
        aria-labelledby={titleId}
        className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm"
      >
        {categorias.map((c) => {
          const pct = percentual(c.valor, totalGeral);
          return (
            <li key={c.categoria_id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span
                    className={cn(
                      'truncate font-semibold',
                      c.ativa ? 'text-slate-900' : 'text-slate-600',
                    )}
                  >
                    {c.nome}
                  </span>
                  {!c.ativa && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      inativa
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-slate-600">
                  {formatInteiro(c.quantidade)} un
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {formatBRL(c.valor)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div
                  data-testid="barra"
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="sr-only">{pct}% do total</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
