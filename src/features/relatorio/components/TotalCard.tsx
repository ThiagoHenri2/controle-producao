import { useId } from 'react';
import { Card } from '@/components/ui';
import { formatBRL } from '@/lib/format';
import { formatEntregas } from '../format';

type TotalCardProps = { totalGeral: number; quantidadeTotal: number };

/** Destaque com o total em R$ do período (calculado pelo banco). */
export function TotalCard({ totalGeral, quantidadeTotal }: TotalCardProps) {
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
    </Card>
  );
}
