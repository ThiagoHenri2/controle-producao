import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, BarChart3, FilterX, Plus } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { UsuarioAlvoSelect } from '@/features/equipe/components/UsuarioAlvoSelect';
import { useUsuarioAlvo } from '@/features/equipe/useUsuarioAlvo';
import { ROUTES } from '@/routes/navigation';
import { CategoriasFiltroButton } from './components/CategoriasFiltroButton';
import { CategoriasSheet } from './components/CategoriasSheet';
import { PeriodoChips } from './components/PeriodoChips';
import { PeriodoSheet } from './components/PeriodoSheet';
import { RelatorioSkeleton } from './components/RelatorioSkeleton';
import { ResumoCategorias } from './components/ResumoCategorias';
import { ResumoDias } from './components/ResumoDias';
import { TotalCard } from './components/TotalCard';
import { FILTRO_MESSAGES, rotuloFiltro } from './filtroCategorias';
import { useCategoriasFiltro, usePeriodoFiltro, useResumo } from './hooks';
import { formatIntervalo } from './periodos';

/**
 * Relatório (spec 005): total do período, por categoria e por dia, com filtro de categorias.
 * O gestor escolhe o entregador (`?usuario=`, `p_usuario`, spec 008).
 */
export function RelatorioPage() {
  const navigate = useNavigate();
  const alvo = useUsuarioAlvo();
  const { periodo, hoje, escolherRapido, escolherPersonalizado } = usePeriodoFiltro();
  const filtro = useCategoriasFiltro(alvo.alvoId);
  const { data, isPending, isError, error, refetch, isRefetching } = useResumo(
    periodo.de,
    periodo.ate,
    filtro.selecionadas,
    { usuarioId: alvo.alvoId, pUsuario: alvo.pUsuario, enabled: filtro.pronto },
  );
  const [sheetAberto, setSheetAberto] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const filtrando = filtro.selecionadas !== null;

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
  } else if (data.categorias.length === 0 && filtrando) {
    conteudo = (
      <EmptyState
        icon={FilterX}
        title={FILTRO_MESSAGES.vazio}
        description="Marque outras categorias ou escolha outro período."
        action={
          <Button fullWidth variant="secondary" onClick={filtro.limpar}>
            Limpar filtro
          </Button>
        }
      />
    );
  } else if (data.categorias.length === 0) {
    conteudo = (
      <EmptyState
        icon={BarChart3}
        title="Nenhum lançamento neste período"
        description={
          alvo.isEu
            ? 'Lance suas entregas ou escolha outro período.'
            : `${alvo.alvoNome} não tem lançamentos neste período.`
        }
        action={
          <Button
            fullWidth
            leftIcon={<Plus className="h-5 w-5" aria-hidden />}
            onClick={() => navigate({ pathname: ROUTES.lancar, search: alvo.search })}
          >
            Lançar entregas
          </Button>
        }
      />
    );
  } else {
    conteudo = (
      <div className="flex flex-col gap-5">
        <TotalCard
          totalGeral={data.totalGeral}
          quantidadeTotal={data.quantidadeTotal}
          filtro={
            filtro.selecionadas
              ? {
                  selecionadas: filtro.selecionadas.length,
                  total: filtro.categorias.length,
                  onLimpar: filtro.limpar,
                }
              : undefined
          }
        />
        <ResumoCategorias categorias={data.categorias} totalGeral={data.totalGeral} />
        {data.dias.length > 0 && <ResumoDias dias={data.dias} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <UsuarioAlvoSelect alvo={alvo} acao="vendo" rotulo="Relatório de" />
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
        {filtro.categorias.length > 0 && (
          <CategoriasFiltroButton
            rotulo={rotuloFiltro(filtro.selecionadas, filtro.categorias)}
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
          categorias={filtro.categorias}
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
