import { useState } from 'react';
import { AlertCircle, ChevronDown, Plus, Tags } from 'lucide-react';
import { Button, EmptyState, SkeletonList } from '@/components/ui';
import { UsuarioAlvoSelect } from '@/features/equipe/components/UsuarioAlvoSelect';
import { useUsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { cn } from '@/lib/cn';
import type { Categoria } from './api';
import { CategoriaFormSheet } from './components/CategoriaFormSheet';
import { CategoriaItem } from './components/CategoriaItem';
import { CATEGORIA_ERROR_MESSAGES } from './errors';
import { useCategorias } from './hooks';

type SheetState = { open: false } | { open: true; categoria: Categoria | null };

/** Categorias (spec 003). O gestor gerencia as de qualquer entregador (spec 008). */
export function CategoriasPage() {
  const alvo = useUsuarioAlvo();
  const { data, isPending, isError, refetch, isRefetching } = useCategorias(alvo.alvoId, {
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
      userId={alvo.alvoId}
      existentes={data ?? []}
      onClose={() => setSheet({ open: false })}
    />
  );

  const seletor = <UsuarioAlvoSelect alvo={alvo} acao="vendo" rotulo="Categorias de" />;

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        {seletor}
        <SkeletonList rows={4} label="Carregando categorias…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {seletor}
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
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {seletor}
        <EmptyState
          icon={Tags}
          title={
            alvo.isEu
              ? 'Cadastre sua primeira categoria'
              : `Cadastre a primeira categoria de ${alvo.alvoNome}`
          }
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
      </div>
    );
  }

  const ativas = data.filter((c) => c.ativa);
  const inativas = data.filter((c) => !c.ativa);

  return (
    <div className="flex flex-col gap-4">
      {seletor}
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
