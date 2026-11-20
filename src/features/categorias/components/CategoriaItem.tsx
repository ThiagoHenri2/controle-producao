import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { Categoria } from '../api';

type CategoriaItemProps = {
  categoria: Categoria;
  onEdit: (categoria: Categoria) => void;
};

/** Linha da lista: o cartão inteiro é o alvo de toque para editar. */
export function CategoriaItem({ categoria, onEdit }: CategoriaItemProps) {
  const valor = formatBRL(categoria.valor_unitario);
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(categoria)}
        aria-label={`Editar ${categoria.nome}, ${valor}${categoria.ativa ? '' : ', inativa'}`}
        className={cn(
          'flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-left shadow-sm',
          'hover:bg-slate-50 active:bg-slate-100',
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-base font-semibold',
            categoria.ativa ? 'text-slate-900' : 'text-slate-600',
          )}
        >
          {categoria.nome}
        </span>
        <span
          className={cn(
            'shrink-0 text-base font-semibold tabular-nums',
            categoria.ativa ? 'text-slate-900' : 'text-slate-600',
          )}
        >
          {valor}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
      </button>
    </li>
  );
}
