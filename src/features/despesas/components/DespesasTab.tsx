import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Plus, Receipt } from 'lucide-react';
import { Button, EmptyState, SkeletonList } from '@/components/ui';
import { useCategoriasDespesa } from '@/features/categorias/hooks';
import type { UsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { ROUTES } from '@/routes/navigation';
import { searchComAba } from '../aba';
import { DespesasDoDia } from './DespesasDoDia';
import { NovaDespesaForm } from './NovaDespesaForm';

type DespesasTabProps = {
  alvo: UsuarioAlvo;
  data: string;
  hoje: string;
  onSavingChange: (saving: boolean) => void;
};

/** Lançar › Despesas (spec 009): formulário de valor livre + despesas do dia. */
export function DespesasTab({ alvo, data, hoje, onSavingChange }: DespesasTabProps) {
  const categorias = useCategoriasDespesa(alvo.alvoId, { incluirInativas: false });

  let corpo: ReactNode;
  if (categorias.isPending) {
    corpo = <SkeletonList rows={2} label="Carregando categorias de despesa…" />;
  } else if (categorias.isError) {
    corpo = (
      <EmptyState
        icon={AlertCircle}
        title="Não foi possível carregar as categorias de despesa."
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
        icon={Receipt}
        title={
          alvo.isEu
            ? 'Cadastre suas categorias de despesa'
            : `${alvo.alvoNome} ainda não tem categorias de despesa ativas`
        }
        description="Ex.: Combustível ou Manutenção. O valor você digita a cada despesa."
        action={
          <Link
            to={{ pathname: ROUTES.categorias, search: searchComAba(alvo.search, 'despesas') }}
            className="inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-5 w-5" aria-hidden />
            Cadastrar categorias de despesa
          </Link>
        }
      />
    );
  } else {
    corpo = (
      <NovaDespesaForm
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
      <DespesasDoDia userId={alvo.alvoId} data={data} />
      {/* Espaço para a barra fixa "Adicionar despesa" não cobrir o fim da lista. */}
      {temBarraFixa && <div className="h-20" aria-hidden />}
    </div>
  );
}
