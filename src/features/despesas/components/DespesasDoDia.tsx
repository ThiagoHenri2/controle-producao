import { useMemo, useState } from 'react';
import { Button, Skeleton } from '@/components/ui';
import { idsDeOutrosAutores } from '@/features/lancamentos/api';
import { tituloDespesasDoDia } from '@/features/lancamentos/dates';
import { useAutores } from '@/features/lancamentos/hooks';
import { formatBRL, fromCentavos, somarCentavos } from '@/lib/format';
import type { DespesaComCategoria } from '../api';
import { DESPESA_ERROR_MESSAGES } from '../errors';
import { useDespesasDoDia } from '../hooks';
import { DespesaItem } from './DespesaItem';
import { EditarDespesaSheet } from './EditarDespesaSheet';

type DespesasDoDiaProps = {
  /** Dono da lista (o próprio usuário ou o atendente alvo do gestor). */
  userId: string;
  data: string;
};

/** Lista "Despesas de hoje / em <data>" com o total do dia (soma em centavos inteiros). */
export function DespesasDoDia({ userId, data }: DespesasDoDiaProps) {
  const { data: rows, isPending, isError, refetch, isRefetching } = useDespesasDoDia(userId, data);
  // Um único pedido de nomes por lista (selo "por <nome>").
  const idsAutores = useMemo(() => idsDeOutrosAutores(rows ?? []), [rows]);
  const autores = useAutores(idsAutores);
  const [editando, setEditando] = useState<DespesaComCategoria | null>(null);
  const titulo = tituloDespesasDoDia(data);
  const headingId = 'despesas-do-dia-titulo';

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
          <span className="sr-only">Carregando despesas…</span>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-center">
          <p className="text-sm text-slate-700">{DESPESA_ERROR_MESSAGES.carregar}</p>
          <Button variant="secondary" loading={isRefetching} onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
          Nenhuma despesa neste dia.
        </p>
      ) : (
        <>
          <ul aria-label={titulo} className="flex flex-col gap-2">
            {rows.map((d) => (
              <DespesaItem
                key={d.id}
                despesa={d}
                autor={
                  d.criado_por && d.criado_por !== d.user_id ? autores.get(d.criado_por) : undefined
                }
                onEdit={setEditando}
              />
            ))}
          </ul>
          <p className="flex items-center justify-between px-3 py-1 text-base font-bold text-slate-900">
            <span>Total do dia</span>
            <span className="tabular-nums text-red-700" data-testid="total-despesas-dia">
              {formatBRL(fromCentavos(somarCentavos(rows.map((r) => r.valor))))}
            </span>
          </p>
        </>
      )}

      {editando && (
        <EditarDespesaSheet
          key={editando.id}
          despesa={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </section>
  );
}
