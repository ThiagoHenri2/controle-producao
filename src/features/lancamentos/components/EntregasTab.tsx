import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Plus, Tags } from 'lucide-react';
import { Button, EmptyState, SkeletonList } from '@/components/ui';
import { useCategorias } from '@/features/categorias/hooks';
import type { UsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { ROUTES } from '@/routes/navigation';
import { LancamentosDoDia } from './LancamentosDoDia';
import { NovoLancamentoForm } from './NovoLancamentoForm';

type EntregasTabProps = {
  alvo: UsuarioAlvo;
  data: string;
  hoje: string;
  onSavingChange: (saving: boolean) => void;
};

/**
 * Lançar › Entregas (spec 004): steppers por categoria ativa e o que já foi lançado no dia.
 * O gestor pode lançar para outro entregador (spec 008): categorias, preços e lista são do alvo.
 */
export function EntregasTab({ alvo, data, hoje, onSavingChange }: EntregasTabProps) {
  const categorias = useCategorias(alvo.alvoId, { incluirInativas: false });

  let corpo: ReactNode;
  if (categorias.isPending) {
    corpo = <SkeletonList rows={3} label="Carregando categorias…" />;
  } else if (categorias.isError) {
    corpo = (
      <EmptyState
        icon={AlertCircle}
        title="Não foi possível carregar as categorias."
        description="Verifique sua conexão e tente de novo."
        action={
          <Button
            fullWidth
            variant="secondary"
            loading={categorias.isRefetching}
            onClick={() => categorias.refetch()}
          >
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (categorias.data.length === 0) {
    corpo = (
      <EmptyState
        icon={Tags}
        title={
          alvo.isEu
            ? 'Cadastre suas categorias para começar'
            : `${alvo.alvoNome} ainda não tem categorias ativas`
        }
        description="Ex.: Sanduíche a R$ 2,50. Depois é só informar quantas entregas fez."
        action={
          <Link
            to={{ pathname: ROUTES.categorias, search: alvo.search }}
            className="inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-5 w-5" aria-hidden />
            Cadastrar categorias
          </Link>
        }
      />
    );
  } else {
    corpo = (
      <NovoLancamentoForm
        key={alvo.alvoId}
        categorias={categorias.data}
        userId={alvo.alvoId}
        data={data}
        hoje={hoje}
        onSavingChange={onSavingChange}
      />
    );
  }

  const temBarraFixa = categorias.isSuccess && categorias.data.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {corpo}
      <LancamentosDoDia userId={alvo.alvoId} data={data} />
      {/* Espaço para a barra fixa "Subtotal · Salvar" não cobrir o fim da lista. */}
      {temBarraFixa && <div className="h-20" aria-hidden />}
    </div>
  );
}
