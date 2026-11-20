import { useId } from 'react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBRL, fromCentavos } from '@/lib/format';
import { saldoCentavos } from '../saldo';
import { FiltroAviso, type TotalCardFiltro } from './TotalCard';

type SaldoCardProps = {
  /** Padrão: "Saldo no período". */
  titulo?: string;
  /** Totais calculados pelo banco (`total_geral`), em reais. */
  receitas: number | string;
  despesas: number | string;
  /** Presente só com filtro de categorias ativo. */
  filtro?: TotalCardFiltro;
};

/**
 * "Ambos" (spec 009): Receitas (verde) e Despesas (vermelho) lado a lado e o
 * Saldo = receitas − despesas em destaque (vermelho se negativo), em centavos.
 */
export function SaldoCard({
  titulo = 'Saldo no período',
  receitas,
  despesas,
  filtro,
}: SaldoCardProps) {
  const titleId = useId();
  const saldo = saldoCentavos(receitas, despesas);
  const negativo = saldo < 0;
  return (
    <Card role="region" aria-labelledby={titleId} className="border-primary/30 bg-primary-soft">
      <dl className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-sm font-medium text-slate-700">Receitas</dt>
          <dd
            className="truncate text-lg font-bold tabular-nums text-green-700"
            data-testid="saldo-receitas"
          >
            {formatBRL(receitas)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-medium text-slate-700">Despesas</dt>
          <dd
            className="truncate text-lg font-bold tabular-nums text-red-700"
            data-testid="saldo-despesas"
          >
            {formatBRL(despesas)}
          </dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-primary/20 pt-2">
        <h2 id={titleId} className="text-sm font-medium text-slate-700">
          {titulo}
        </h2>
        <p
          className={cn(
            'mt-1 text-3xl font-bold tabular-nums',
            negativo ? 'text-red-700' : 'text-slate-900',
          )}
          data-testid="saldo-valor"
        >
          {formatBRL(fromCentavos(saldo))}
        </p>
      </div>
      {filtro && <FiltroAviso filtro={filtro} />}
    </Card>
  );
}
