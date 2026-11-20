import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, BarChart3, Plus } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { ROUTES } from '@/routes/navigation';
import { PeriodoChips } from './components/PeriodoChips';
import { PeriodoSheet } from './components/PeriodoSheet';
import { RelatorioSkeleton } from './components/RelatorioSkeleton';
import { ResumoCategorias } from './components/ResumoCategorias';
import { ResumoDias } from './components/ResumoDias';
import { TotalCard } from './components/TotalCard';
import { usePeriodoFiltro, useResumo } from './hooks';
import { formatIntervalo } from './periodos';

/** Relatório (spec 005): total do período, por categoria e por dia. */
export function RelatorioPage() {
  const navigate = useNavigate();
  const { periodo, hoje, escolherRapido, escolherPersonalizado } = usePeriodoFiltro();
  const { data, isPending, isError, error, refetch, isRefetching } = useResumo(
    periodo.de,
    periodo.ate,
  );
  const [sheetAberto, setSheetAberto] = useState(false);

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
  } else if (data.categorias.length === 0) {
    conteudo = (
      <EmptyState
        icon={BarChart3}
        title="Nenhum lançamento neste período"
        description="Lance suas entregas ou escolha outro período."
        action={
          <Button
            fullWidth
            leftIcon={<Plus className="h-5 w-5" aria-hidden />}
            onClick={() => navigate(ROUTES.lancar)}
          >
            Lançar entregas
          </Button>
        }
      />
    );
  } else {
    conteudo = (
      <div className="flex flex-col gap-5">
        <TotalCard totalGeral={data.totalGeral} quantidadeTotal={data.quantidadeTotal} />
        <ResumoCategorias categorias={data.categorias} totalGeral={data.totalGeral} />
        {data.dias.length > 0 && <ResumoDias dias={data.dias} />}
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
    </div>
  );
}
