import { useId } from 'react';
import { formatBRL, rotuloData } from '@/lib/format';
import type { ResumoDia } from '../api';
import { formatInteiro } from '../format';

type ResumoDiasProps = {
  dias: ResumoDia[];
  /** Texto da quantidade. Padrão: "70 un" (entregas). */
  unidade?: (quantidade: number) => string;
};

const unidadePadrao = (n: number) => `${formatInteiro(n)} un`;

/** Lista por dia ("Hoje", "Ontem", "dd/MM"), para conferir com o que recebeu. */
export function ResumoDias({ dias, unidade = unidadePadrao }: ResumoDiasProps) {
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
          <li key={d.data} className="flex min-h-touch items-center gap-2 px-4 py-2">
            <time dateTime={d.data} className="flex-1 font-medium text-slate-900">
              {rotuloData(d.data, agora)}
            </time>
            <span className="shrink-0 text-sm tabular-nums text-slate-600">
              {unidade(Number(d.quantidade))}
            </span>
            <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-slate-900">
              {formatBRL(d.valor)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
