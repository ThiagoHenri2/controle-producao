import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { CategoriaLista } from '../hooks';

type CategoriaItemProps = {
  /** Categoria de entrega (mostra o valor) ou de despesa (sem valor). */
  categoria: CategoriaLista;
  onEdit: (categoria: CategoriaLista) => void;
};

/** Linha da lista: o cartão inteiro é o alvo de toque para editar. */
export function CategoriaItem({ categoria, onEdit }: CategoriaItemProps) {
  const valor = categoria.valor_unitario !== undefined ? formatBRL(categoria.valor_unitario) : null;
  const cor = categoria.ativa ? 'text-slate-900' : 'text-slate-600';
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(categoria)}
        aria-label={`Editar ${categoria.nome}${valor ? `, ${valor}` : ''}${categoria.ativa ? '' : ', inativa'}`}
        className={cn(
          'flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-left shadow-sm',
          'hover:bg-slate-50 active:bg-slate-100',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate text-base font-semibold', cor)}>
          {categoria.nome}
        </span>
        {valor && (
          <span className={cn('shrink-0 text-base font-semibold tabular-nums', cor)}>{valor}</span>
        )}
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
      </button>
    </li>
  );
}
