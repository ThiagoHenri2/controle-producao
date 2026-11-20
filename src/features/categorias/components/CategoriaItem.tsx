import { ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { CategoriaLista } from '../hooks';

type CategoriaItemProps = {
  /** Categoria de entrega (mostra o valor) ou de despesa (sem valor). */
  categoria: CategoriaLista;
  onEdit: (categoria: CategoriaLista) => void;
  /**
   * Só para o dono com gerente (spec 011): mostra o switch "Visível para <nome>".
   * Tocar nele não abre o sheet de edição.
   */
  visibilidade?: {
    gerenteNome: string;
    onChange: (categoria: CategoriaLista, visivel: boolean) => void;
  };
};

/** Linha da lista: o cartão inteiro é o alvo de toque para editar. */
export function CategoriaItem({ categoria, onEdit, visibilidade }: CategoriaItemProps) {
  const valor = categoria.valor_unitario !== undefined ? formatBRL(categoria.valor_unitario) : null;
  const cor = categoria.ativa ? 'text-slate-900' : 'text-slate-600';
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => onEdit(categoria)}
        aria-label={`Editar ${categoria.nome}${valor ? `, ${valor}` : ''}${categoria.ativa ? '' : ', inativa'}`}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
      >
        <span className={cn('min-w-0 flex-1 truncate text-base font-semibold', cor)}>
          {categoria.nome}
        </span>
        {valor && (
          <span className={cn('shrink-0 text-base font-semibold tabular-nums', cor)}>{valor}</span>
        )}
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
      </button>
      {visibilidade && (
        <div className="border-t border-slate-100 px-4">
          <Switch
            label={`Visível para ${visibilidade.gerenteNome}`}
            checked={categoria.visivel_gerente === true}
            onChange={(v) => visibilidade.onChange(categoria, v)}
          />
        </div>
      )}
    </li>
  );
}
