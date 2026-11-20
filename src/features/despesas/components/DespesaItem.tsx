import { MoreVertical } from 'lucide-react';
import { AutorSelo } from '@/features/lancamentos/components/AutorSelo';
import { formatBRL } from '@/lib/format';
import type { DespesaComCategoria } from '../api';

type DespesaItemProps = {
  despesa: DespesaComCategoria;
  /** Nome de quem lançou, quando não foi o próprio dono (selo "por <nome>"). */
  autor?: string;
  onEdit: (despesa: DespesaComCategoria) => void;
};

/** Linha "Combustível · posto  R$ 35,90": o cartão inteiro abre a edição. */
export function DespesaItem({ despesa, autor, onEdit }: DespesaItemProps) {
  const nome = despesa.categoria?.nome ?? 'Categoria removida';
  const valor = formatBRL(despesa.valor);
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(despesa)}
        aria-label={`Editar despesa ${nome}, ${valor}${autor ? `, lançada por ${autor}` : ''}`}
        className="flex min-h-[56px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-surface py-2 pl-3 pr-1 text-left shadow-sm hover:bg-slate-50 active:bg-slate-100"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold text-slate-900">{nome}</span>
            {autor && <AutorSelo autor={autor} />}
          </span>
          {despesa.descricao && (
            <span className="block truncate text-sm italic text-slate-600">
              {despesa.descricao}
            </span>
          )}
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-red-700">{valor}</span>
        <MoreVertical className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
      </button>
    </li>
  );
}
