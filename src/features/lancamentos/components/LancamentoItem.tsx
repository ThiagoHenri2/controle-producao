import { MoreVertical } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import type { LancamentoComCategoria } from '../api';

type LancamentoItemProps = {
  lancamento: LancamentoComCategoria;
  onEdit: (lancamento: LancamentoComCategoria) => void;
};

/** Linha "Sanduíche  30 × R$ 2,50  R$ 75,00": o cartão inteiro abre a edição. */
export function LancamentoItem({ lancamento, onEdit }: LancamentoItemProps) {
  const nome = lancamento.categoria?.nome ?? 'Categoria removida';
  const unitario = formatBRL(lancamento.valor_unitario);
  const total = formatBRL(lancamento.valor_total);
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(lancamento)}
        aria-label={`Editar ${nome}, ${lancamento.quantidade} × ${unitario}, ${total}`}
        className="flex min-h-[56px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-surface py-2 pl-3 pr-1 text-left shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-slate-900">{nome}</span>
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
