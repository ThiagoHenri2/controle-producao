import { useState, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, Eye, EyeOff, Info, Plus, Tags } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, SkeletonList, useToast } from '@/components/ui';
import { usePermissoesAlvo } from '@/features/equipe/usePermissoesAlvo';
import type { UsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { cn } from '@/lib/cn';
import { CATEGORIA_ERROR_MESSAGES } from '../errors';
import {
  useCategoriasDoTipo,
  useSetVisibilidadeTodas,
  useToggleVisibilidade,
  type CategoriaLista,
  type TipoCategoria,
} from '../hooks';
import { CategoriaFormSheet } from './CategoriaFormSheet';
import { CategoriaItem } from './CategoriaItem';

type SheetState = { open: false } | { open: true; categoria: CategoriaLista | null };

const TEXTOS = {
  entregas: {
    vazioEu: 'Cadastre sua primeira categoria',
    vazioOutro: (nome: string) => `Cadastre a primeira categoria de ${nome}`,
    vazioDescricao:
      'Ex.: Sanduíche a R$ 2,50 ou Pizza a R$ 5,00. Depois é só lançar as entregas do dia.',
    ativas: 'Categorias ativas',
    inativas: 'Categorias inativas',
  },
  despesas: {
    vazioEu: 'Cadastre sua primeira categoria de despesa',
    vazioOutro: (nome: string) => `Cadastre a primeira categoria de despesa de ${nome}`,
    vazioDescricao:
      'Ex.: Combustível ou Manutenção. O valor você informa em cada despesa, na tela Lançar.',
    ativas: 'Categorias de despesa ativas',
    inativas: 'Categorias de despesa inativas',
  },
} as const;

type CategoriasListaProps = {
  /** `entregas` (spec 003) ou `despesas` (spec 009, sem valor). */
  tipo: TipoCategoria;
  /** Dono das categorias: o próprio usuário ou o atendente alvo do gestor (spec 008). */
  alvo: UsuarioAlvo;
};

/** Lista de categorias do tipo (ativas, inativas recolhidas) com "Nova categoria" fixo. */
export function CategoriasLista({ tipo, alvo }: CategoriasListaProps) {
  const textos = TEXTOS[tipo];
  const { data, isPending, isError, refetch, isRefetching } = useCategoriasDoTipo(
    tipo,
    alvo.alvoId,
    { incluirInativas: true },
  );
  const toast = useToast();
  const perms = usePermissoesAlvo(alvo);
  const toggle = useToggleVisibilidade();
  const todas = useSetVisibilidadeTodas();
  const [confirmaTodas, setConfirmaTodas] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  // Visibilidade para o gerente (spec 011): só categorias de entrega, só o dono com gerente.
  const gerenteNome =
    tipo === 'entregas' && perms.podeAlterarVisibilidade ? perms.meuGerente?.nome : undefined;
  const gerenteVendo = tipo === 'entregas' && perms.ehGerenteVendoAtendente;
  const visibilidade =
    gerenteNome === undefined
      ? undefined
      : {
          gerenteNome,
          onChange: (c: CategoriaLista, visivel: boolean) =>
            toggle.mutate(
              { id: c.id, userId: c.user_id, visivel },
              { onError: () => toast.error(CATEGORIA_ERROR_MESSAGES.visibilidade) },
            ),
        };

  function aplicarTodas() {
    if (confirmaTodas === null) return;
    const visivel = confirmaTodas;
    todas.mutate(
      { userId: alvo.alvoId, visivel },
      {
        onSuccess: () => {
          setConfirmaTodas(null);
          toast.success(visivel ? 'Todas as categorias visíveis.' : 'Todas as categorias ocultas.');
        },
        onError: (err) => {
          setConfirmaTodas(null);
          toast.error(err.message);
        },
      },
    );
  }
  const [mostrarInativas, setMostrarInativas] = useState(false);

  const novaCategoria = () => setSheet({ open: true, categoria: null });
  const editar = (categoria: CategoriaLista) => setSheet({ open: true, categoria });
  const inativasId = `categorias-inativas-${tipo}`;

  const sheetEl = sheet.open && (
    <CategoriaFormSheet
      key={sheet.categoria?.id ?? 'nova'}
      tipo={tipo}
      categoria={sheet.categoria}
      userId={alvo.alvoId}
      existentes={data ?? []}
      gerenteNome={gerenteNome}
      onClose={() => setSheet({ open: false })}
    />
  );

  if (isPending) {
    return <SkeletonList rows={4} label="Carregando categorias…" />;
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
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
        <EmptyState
          icon={Tags}
          title={
            gerenteVendo
              ? `${alvo.alvoNome} ainda não liberou nenhuma categoria para você.`
              : alvo.isEu
                ? textos.vazioEu
                : textos.vazioOutro(alvo.alvoNome)
          }
          description={
            gerenteVendo
              ? 'Você pode criar uma categoria para ele. Ela já nasce visível.'
              : textos.vazioDescricao
          }
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
      {gerenteVendo && <Nota>Você vê apenas as categorias liberadas por {alvo.alvoNome}.</Nota>}
      {gerenteNome !== undefined && (
        <div className="flex flex-col gap-2">
          <Nota>Seu gerente {gerenteNome} só vê as categorias marcadas.</Nota>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              leftIcon={<Eye className="h-5 w-5" aria-hidden />}
              onClick={() => setConfirmaTodas(true)}
            >
              Mostrar todas
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              leftIcon={<EyeOff className="h-5 w-5" aria-hidden />}
              onClick={() => setConfirmaTodas(false)}
            >
              Ocultar todas
            </Button>
          </div>
        </div>
      )}
      {ativas.length > 0 ? (
        <ul aria-label={textos.ativas} className="flex flex-col gap-2">
          {ativas.map((c) => (
            <CategoriaItem key={c.id} categoria={c} onEdit={editar} visibilidade={visibilidade} />
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
            aria-controls={inativasId}
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
            <ul id={inativasId} aria-label={textos.inativas} className="flex flex-col gap-2">
              {inativas.map((c) => (
                <CategoriaItem
                  key={c.id}
                  categoria={c}
                  onEdit={editar}
                  visibilidade={visibilidade}
                />
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
      <ConfirmDialog
        open={confirmaTodas !== null}
        title={confirmaTodas ? 'Mostrar todas?' : 'Ocultar todas?'}
        description={
          confirmaTodas
            ? `${gerenteNome ?? 'Seu gerente'} passa a ver todas as suas categorias.`
            : `${gerenteNome ?? 'Seu gerente'} deixa de ver todas as suas categorias.`
        }
        confirmLabel={confirmaTodas ? 'Mostrar todas' : 'Ocultar todas'}
        variant="primary"
        loading={todas.isPending}
        onConfirm={aplicarTodas}
        onCancel={() => setConfirmaTodas(null)}
      />
    </div>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-sm font-medium text-slate-900"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
