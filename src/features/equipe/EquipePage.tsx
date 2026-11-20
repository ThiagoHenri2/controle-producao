import { useState } from 'react';
import { AlertCircle, FilterX, Users } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { CategoriasFiltroButton } from '@/features/relatorio/components/CategoriasFiltroButton';
import { CategoriasSheet } from '@/features/relatorio/components/CategoriasSheet';
import { PeriodoChips } from '@/features/relatorio/components/PeriodoChips';
import { PeriodoSheet } from '@/features/relatorio/components/PeriodoSheet';
import { RelatorioSkeleton } from '@/features/relatorio/components/RelatorioSkeleton';
import { TotalCard } from '@/features/relatorio/components/TotalCard';
import { FILTRO_MESSAGES, rotuloFiltro } from '@/features/relatorio/filtroCategorias';
import { usePeriodoFiltro } from '@/features/relatorio/hooks';
import { formatIntervalo, periodoToSearchParams } from '@/features/relatorio/periodos';
import { ROUTES } from '@/routes/navigation';
import { EquipeLista } from './components/EquipeLista';
import { useNomesFiltro, useResumoEquipe } from './hooks';
import { USUARIO_PARAM } from './useUsuarioAlvo';

/**
 * Equipe (spec 008, só gestor): quanto pagar a cada entregador no período e o
 * total de todos, com filtro por nome de categoria. Estado na URL
 * (`periodo`/`de`/`ate`/`nomes`).
 */
export function EquipePage() {
  const { periodo, hoje, escolherRapido, escolherPersonalizado } = usePeriodoFiltro();
  const filtro = useNomesFiltro();
  const { data, isPending, isError, error, refetch, isRefetching } = useResumoEquipe(
    periodo.de,
    periodo.ate,
    filtro.selecionadas,
    { enabled: filtro.pronto },
  );
  const [sheetAberto, setSheetAberto] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const filtrando = filtro.selecionadas !== null;

  /** Relatório do entregador com o mesmo período. */
  const linkPara = (userId: string) => {
    const params = periodoToSearchParams(periodo);
    params.set(USUARIO_PARAM, userId);
    return { pathname: ROUTES.relatorio, search: `?${params.toString()}` };
  };

  let conteudo;
  if (isPending) {
    conteudo = <RelatorioSkeleton />;
  } else if (isError) {
    conteudo = (
      <EmptyState
        icon={AlertCircle}
        title={error.message}
        description="Verifique sua conexão e tente de novo."
        action={
          <Button fullWidth variant="secondary" loading={isRefetching} onClick={() => refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (data.usuarios.length === 0) {
    conteudo = (
      <EmptyState
        icon={Users}
        title="Nenhum entregador cadastrado"
        description="Os entregadores são cadastrados pelo admin, em Usuários."
      />
    );
  } else {
    conteudo = (
      <div className="flex flex-col gap-5">
        <TotalCard
          titulo="Total a pagar (todos)"
          totalGeral={data.totalGeral}
          quantidadeTotal={data.quantidadeTotal}
          filtro={
            filtro.selecionadas
              ? {
                  selecionadas: filtro.selecionadas.length,
                  total: filtro.opcoes.length,
                  onLimpar: filtro.limpar,
                }
              : undefined
          }
        />
        {data.quantidadeTotal === 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-700">
            <FilterX className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            {filtrando ? FILTRO_MESSAGES.vazio : 'Ninguém lançou entregas neste período.'}
          </p>
        )}
        <EquipeLista usuarios={data.usuarios} totalGeral={data.totalGeral} linkPara={linkPara} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <PeriodoChips
          ativo={periodo.tipo}
          onRapido={escolherRapido}
          onPersonalizado={() => setSheetAberto(true)}
        />
        <p
          className="text-center text-sm font-medium tabular-nums text-slate-700"
          aria-live="polite"
        >
          {formatIntervalo(periodo)}
        </p>
        {filtro.opcoes.length > 0 && (
          <CategoriasFiltroButton
            rotulo={rotuloFiltro(filtro.selecionadas, filtro.opcoes)}
            ativo={filtrando}
            onClick={() => setFiltroAberto(true)}
          />
        )}
      </div>

      {conteudo}

      {sheetAberto && (
        <PeriodoSheet
          inicial={periodo}
          hoje={hoje}
          onClose={() => setSheetAberto(false)}
          onAplicar={(intervalo) => {
            escolherPersonalizado(intervalo);
            setSheetAberto(false);
          }}
        />
      )}

      {filtroAberto && (
        <CategoriasSheet
          categorias={filtro.opcoes}
          selecionadas={filtro.selecionadas}
          onClose={() => setFiltroAberto(false)}
          onAplicar={(ids) => {
            filtro.aplicar(ids);
            setFiltroAberto(false);
          }}
        />
      )}
    </div>
  );
}
