import { useState } from 'react';
import { Button, Skeleton } from '@/components/ui';
import { formatBRL, fromCentavos } from '@/lib/format';
import type { LancamentoComCategoria } from '../api';
import { tituloJaLancado } from '../dates';
import { LANCAMENTO_ERROR_MESSAGES } from '../errors';
import { useLancamentosDoDia } from '../hooks';
import { totalCentavos } from '../schema';
import { EditarLancamentoSheet } from './EditarLancamentoSheet';
import { LancamentoItem } from './LancamentoItem';

type LancamentosDoDiaProps = { data: string };

/** Lista "Já lançado …" da data selecionada, com total do dia (soma de `valor_total`). */
export function LancamentosDoDia({ data }: LancamentosDoDiaProps) {
  const { data: rows, isPending, isError, refetch, isRefetching } = useLancamentosDoDia(data);
  const [editando, setEditando] = useState<LancamentoComCategoria | null>(null);
  const titulo = tituloJaLancado(data);
  const headingId = 'ja-lancado-titulo';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600"
      >
        {titulo}
        <span className="h-px flex-1 bg-slate-300" aria-hidden />
      </h2>

      {isPending ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Carregando lançamentos…</span>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-center">
          <p className="text-sm text-slate-700">{LANCAMENTO_ERROR_MESSAGES.carregar}</p>
          <Button variant="secondary" loading={isRefetching} onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
          Nada lançado neste dia ainda.
        </p>
      ) : (
        <>
          <ul aria-label={titulo} className="flex flex-col gap-2">
            {rows.map((l) => (
              <LancamentoItem key={l.id} lancamento={l} onEdit={setEditando} />
            ))}
          </ul>
          <p className="flex items-center justify-between px-3 py-1 text-base font-bold text-slate-900">
            <span>Total do dia</span>
            <span className="tabular-nums" data-testid="total-dia">
              {formatBRL(fromCentavos(totalCentavos(rows)))}
            </span>
          </p>
        </>
      )}

      {editando && (
        <EditarLancamentoSheet
          key={editando.id}
          lancamento={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </section>
  );
}
