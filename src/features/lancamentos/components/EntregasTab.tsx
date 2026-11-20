import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Plus, Tags } from 'lucide-react';
import { Button, EmptyState, SkeletonList } from '@/components/ui';
import { useCategorias } from '@/features/categorias/hooks';
import { UsuarioAlvoSelect } from '@/features/equipe/components/UsuarioAlvoSelect';
import { useUsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { ROUTES } from '@/routes/navigation';
import { hojeISO } from '@/lib/format';
import { DateSelector } from './components/DateSelector';
import { LancamentosDoDia } from './components/LancamentosDoDia';
import { NovoLancamentoForm } from './components/NovoLancamentoForm';
import { useDataLancamento } from './useDataLancamento';

/**
 * Tela Lançar (spec 004): data, steppers por categoria ativa e o que já foi lançado no dia.
 * O gestor pode lançar para outro entregador (spec 008): categorias, preços e lista são do alvo.
 */
export function LancamentosPage() {
  const [data, setData] = useDataLancamento();
  const [saving, setSaving] = useState(false);
  const hoje = hojeISO();
  const alvo = useUsuarioAlvo();
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
        onSavingChange={setSaving}
      />
    );
  }

  const temBarraFixa = categorias.isSuccess && categorias.data.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <UsuarioAlvoSelect alvo={alvo} acao="lançando" />
      <DateSelector value={data} hoje={hoje} onChange={setData} disabled={saving} />
      {corpo}
      <LancamentosDoDia userId={alvo.alvoId} data={data} />
      {/* Espaço para a barra fixa "Subtotal · Salvar" não cobrir o fim da lista. */}
      {temBarraFixa && <div className="h-20" aria-hidden />}
    </div>
  );
}
