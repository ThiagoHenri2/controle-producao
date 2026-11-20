import { useId } from 'react';
import { Filter } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatBRL } from '@/lib/format';
import { formatEntregas } from '../format';

export type TotalCardFiltro = {
  /** Quantas categorias estão marcadas. */
  selecionadas: number;
  /** Quantas categorias o usuário tem. */
  total: number;
  onLimpar: () => void;
};

type TotalCardProps = {
  totalGeral: number;
  quantidadeTotal: number;
  /** Presente só com filtro de categorias ativo. */
  filtro?: TotalCardFiltro;
};

/** Destaque com o total em R$ do período (calculado pelo banco, já filtrado). */
export function TotalCard({ totalGeral, quantidadeTotal, filtro }: TotalCardProps) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="border-primary/30 bg-primary-soft">
      <h2 id={titleId} className="text-sm font-medium text-slate-700">
        Total no período
      </h2>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{formatBRL(totalGeral)}</p>
      <p className="mt-1 text-base font-medium tabular-nums text-slate-700">
        {formatEntregas(quantidadeTotal)}
      </p>
      {filtro && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1 border-t border-primary/20 pt-1 text-sm text-slate-800">
          <Filter className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="tabular-nums">
            Filtrando {filtro.selecionadas} de {filtro.total} categorias
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={filtro.onLimpar}
            className="min-h-touch rounded px-1 font-semibold text-primary underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Limpar filtro
          </button>
        </p>
      )}
    </Card>
  );
}
