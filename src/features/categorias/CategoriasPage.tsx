import { useState } from 'react';
import { AlertCircle, ChevronDown, Plus, Tags } from 'lucide-react';
import { Button, EmptyState, SkeletonList } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Categoria } from './api';
import { CategoriaFormSheet } from './components/CategoriaFormSheet';
import { CategoriaItem } from './components/CategoriaItem';
import { CATEGORIA_ERROR_MESSAGES } from './errors';
import { useCategorias } from './hooks';

type SheetState = { open: false } | { open: true; categoria: Categoria | null };

export function CategoriasPage() {
  const { data, isPending, isError, refetch, isRefetching } = useCategorias({
    incluirInativas: true,
  });
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [mostrarInativas, setMostrarInativas] = useState(false);

  const novaCategoria = () => setSheet({ open: true, categoria: null });
  const editar = (categoria: Categoria) => setSheet({ open: true, categoria });

  const sheetEl = sheet.open && (
    <CategoriaFormSheet
      key={sheet.categoria?.id ?? 'nova'}
      categoria={sheet.categoria}
      existentes={data ?? []}
      onClose={() => setSheet({ open: false })}
    />
  );

  if (isPending) return <SkeletonList rows={4} label="Carregando categorias…" />;

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={CATEGORIA_ERROR_MESSAGES.carregar}
        description="Verifique sua conexão e tente de novo."
        action={
          <Button fullWidth variant="secondary" loading={isRefetching} onClick={() => refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  if (data.length === 0) {
    return (
      <>
        <EmptyState
          icon={Tags}
          title="Cadastre sua primeira categoria"
          description="Ex.: Sanduíche a R$ 2,50 ou Pizza a R$ 5,00. Depois é só lançar as entregas do dia."
          action={
            <Button
              fullWidth
              leftIcon={<Plus className="h-5 w-5" aria-hidden />}
              onClick={novaCategoria}
            >
              Nova categoria
            </Button>
          }
        />
        {sheetEl}
      </>
    );
  }

  const ativas = data.filter((c) => c.ativa);
  const inativas = data.filter((c) => !c.ativa);

  return (
    <div className="flex flex-col gap-4">
      {ativas.length > 0 ? (
        <ul aria-label="Categorias ativas" className="flex flex-col gap-2">
          {ativas.map((c) => (
            <CategoriaItem key={c.id} categoria={c} onEdit={editar} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
          Nenhuma categoria ativa. Reative uma abaixo ou crie uma nova.
        </p>
      )}

      {inativas.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={mostrarInativas}
            aria-controls="categorias-inativas"
            onClick={() => setMostrarInativas((v) => !v)}
            className="flex min-h-touch items-center gap-2 rounded-lg px-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span className="h-px flex-1 bg-slate-300" aria-hidden />
            Inativas ({inativas.length})
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', mostrarInativas && 'rotate-180')}
              aria-hidden
            />
            <span className="h-px flex-1 bg-slate-300" aria-hidden />
          </button>
          {mostrarInativas && (
            <ul
              id="categorias-inativas"
              aria-label="Categorias inativas"
              className="flex flex-col gap-2"
            >
              {inativas.map((c) => (
                <CategoriaItem key={c.id} categoria={c} onEdit={editar} />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Espaço para o botão fixo não cobrir o último item. */}
      <div className="h-16" aria-hidden />
      <div
        className="fixed inset-x-0 z-20 px-4"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto max-w-md">
          <Button
            fullWidth
            size="lg"
            className="shadow-lg"
            leftIcon={<Plus className="h-5 w-5" aria-hidden />}
            onClick={novaCategoria}
          >
            Nova categoria
          </Button>
        </div>
      </div>
      {sheetEl}
    </div>
  );
}
