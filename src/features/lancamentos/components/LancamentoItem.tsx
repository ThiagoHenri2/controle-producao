import { MoreVertical } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import type { LancamentoComCategoria } from '../api';

type LancamentoItemProps = {
  lancamento: LancamentoComCategoria;
  /** Nome de quem lançou, quando não foi o próprio dono (selo "por <nome>", spec 008). */
  autor?: string;
  onEdit: (lancamento: LancamentoComCategoria) => void;
};

/** Linha "Sanduíche  30 × R$ 2,50  R$ 75,00": o cartão inteiro abre a edição. */
export function LancamentoItem({ lancamento, autor, onEdit }: LancamentoItemProps) {
  const nome = lancamento.categoria?.nome ?? 'Categoria removida';
  const unitario = formatBRL(lancamento.valor_unitario);
  const total = formatBRL(lancamento.valor_total);
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(lancamento)}
        aria-label={`Editar ${nome}, ${lancamento.quantidade} × ${unitario}, ${total}${autor ? `, lançado por ${autor}` : ''}`}
        className="flex min-h-[56px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-surface py-2 pl-3 pr-1 text-left shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold text-slate-900">{nome}</span>
            {autor && (
              <span
                data-testid="selo-autor"
                className="max-w-[55%] shrink-0 truncate rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800"
              >
                por {autor}
              </span>
            )}
          </span>
          <span className="block text-sm tabular-nums text-slate-600">
            {lancamento.quantidade} × {unitario}
          </span>
          {lancamento.observacao && (
            <span className="block truncate text-sm italic text-slate-600">
              {lancamento.observacao}
            </span>
          )}
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-slate-900">
          {total}
        </span>
        <MoreVertical className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
      </button>
    </li>
  );
}
