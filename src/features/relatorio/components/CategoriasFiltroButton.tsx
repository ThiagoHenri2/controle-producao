import { ChevronDown, Filter } from 'lucide-react';
import { cn } from '@/lib/cn';

type CategoriasFiltroButtonProps = {
  /** "Todas" / "Sanduíche" / "2 de 5". */
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
};

/** Botão "Categorias: …" abaixo dos chips de período; abre a checklist. */
export function CategoriasFiltroButton({ rotulo, ativo, onClick }: CategoriasFiltroButtonProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn(
        'flex min-h-touch w-full items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        ativo
          ? 'border-primary bg-primary-soft text-slate-900'
          : 'border-slate-300 bg-surface text-slate-800 hover:bg-slate-50 active:bg-slate-100',
      )}
    >
      <Filter className={cn('h-4 w-4 shrink-0', ativo && 'text-primary')} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">Categorias: {rotulo}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
    </button>
  );
}
