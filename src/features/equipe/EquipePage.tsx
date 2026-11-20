import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, FilterX, Users } from 'lucide-react';
import { Button, EmptyState, SegmentedControl } from '@/components/ui';
import { CategoriasFiltroButton } from '@/features/relatorio/components/CategoriasFiltroButton';
import { CategoriasSheet } from '@/features/relatorio/components/CategoriasSheet';
import { PeriodoChips } from '@/features/relatorio/components/PeriodoChips';
import { PeriodoSheet } from '@/features/relatorio/components/PeriodoSheet';
import { RelatorioSkeleton } from '@/features/relatorio/components/RelatorioSkeleton';
import { SaldoCard } from '@/features/relatorio/components/SaldoCard';
import { TotalCard, type TotalCardFiltro } from '@/features/relatorio/components/TotalCard';
import { FILTRO_MESSAGES, textoBotaoFiltro } from '@/features/relatorio/filtroCategorias';
import { formatLancamentos } from '@/features/relatorio/format';
import {
  usePeriodoFiltro,
  useTipoRelatorio,
  useWriteSearchParams,
} from '@/features/relatorio/hooks';
import { formatIntervalo, periodoToSearchParams } from '@/features/relatorio/periodos';
import { TIPOS, mostraDespesas, mostraReceitas, withTipo } from '@/features/relatorio/tipo';
import { toSearchString } from '@/features/relatorio/filtroCategorias';
import { ROUTES } from '@/routes/navigation';
import { EquipeLista } from './components/EquipeLista';
import { useNomesFiltro, useResumoEquipe, useResumoEquipeDespesas } from './hooks';
import { combinarEquipe } from './ordenar';
import { USUARIO_PARAM } from './useUsuarioAlvo';

type Filtro = ReturnType<typeof useNomesFiltro>;

function resumoFiltro(
  filtros: readonly Filtro[],
  onLimpar: () => void,
): TotalCardFiltro | undefined {
  if (filtros.every((f) => f.selecionadas === null)) return undefined;
  return {
    selecionadas: filtros.reduce(
      (s, f) => s + (f.selecionadas ? f.selecionadas.length : f.opcoes.length),
      0,
    ),
    total: filtros.reduce((s, f) => s + f.opcoes.length, 0),
    onLimpar,
  };
}

/**
 * Equipe (spec 008, só gestor): quanto pagar a cada entregador no período e o
 * total de todos, com filtro por nome de categoria. Tipo Receitas | Despesas |
 * Ambos (spec 009): em Ambos, receitas, despesas e saldo por pessoa. Estado na
 * URL (`periodo`/`de`/`ate`/`tipo`/`nomes`/`dnomes`).
 */
export function EquipePage() {
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const [tipo, setTipo] = useTipoRelatorio();
  const { periodo, hoje, escolherRapido, escolherPersonalizado } = usePeriodoFiltro();
  const comReceitas = mostraReceitas(tipo);
  const comDespesas = mostraDespesas(tipo);
  const filtroR = useNomesFiltro({ tipo: 'entregas', enabled: comReceitas });
  const filtroD = useNomesFiltro({ tipo: 'despesas', enabled: comDespesas });
  const receitas = useResumoEquipe(periodo.de, periodo.ate, filtroR.selecionadas, {
    enabled: comReceitas && filtroR.pronto,
  });
  const despesas = useResumoEquipeDespesas(periodo.de, periodo.ate, filtroD.selecionadas, {
    enabled: comDespesas && filtroD.pronto,
  });
  const [sheetAberto, setSheetAberto] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);

  const secoes = [
    ...(comReceitas ? [{ titulo: 'Entregas', filtro: filtroR }] : []),
    ...(comDespesas ? [{ titulo: 'Despesas', filtro: filtroD }] : []),
  ];
  const gravarFiltros = (porSecao: ReadonlyArray<readonly string[] | null>) => {
    let params = searchParams;
    secoes.forEach(({ filtro }, i) => {
      if (filtro.opcoes.length > 0) params = filtro.paramsCom(params, porSecao[i] ?? null);
    });
    write(params);
  };
  const limparFiltros = () => gravarFiltros(secoes.map(() => null));
  const filtros = secoes.map((s) => s.filtro);
  const filtrando = filtros.some((f) => f.selecionadas !== null);

  /** Relatório do entregador com o mesmo período e o mesmo tipo. */
  const linkPara = (userId: string) => {
    const params = periodoToSearchParams(periodo);
    params.set(USUARIO_PARAM, userId);
    return { pathname: ROUTES.relatorio, search: toSearchString(withTipo(params, tipo)) };
  };

  const pendente = (comReceitas && receitas.isPending) || (comDespesas && despesas.isPending);
  const erro = (comReceitas && receitas.error) || (comDespesas && despesas.error) || null;

  let conteudo: ReactNode;
  if (pendente) {
    conteudo = <RelatorioSkeleton />;
  } else if (erro) {
    conteudo = (
      <EmptyState
        icon={AlertCircle}
        title={erro.message}
        description="Verifique sua conexão e tente de novo."
        action={
          <Button
            fullWidth
            variant="secondary"
            loading={receitas.isRefetching || despesas.isRefetching}
            onClick={() => {
              if (receitas.isError) void receitas.refetch();
              if (despesas.isError) void despesas.refetch();
            }}
          >
            Tentar de novo
          </Button>
        }
      />
    );
  } else {
    const r = receitas.data;
    const d = despesas.data;
    const linhas = combinarEquipe(tipo, r?.usuarios ?? [], d?.usuarios ?? []);
    const filtro = resumoFiltro(filtros, limparFiltros);
    const semNada =
      (!comReceitas || (r?.quantidadeTotal ?? 0) === 0) &&
      (!comDespesas || (d?.quantidadeTotal ?? 0) === 0);
    const avisoVazio = filtrando
      ? FILTRO_MESSAGES.vazio
      : tipo === 'receitas'
        ? 'Ninguém lançou entregas neste período.'
        : tipo === 'despesas'
          ? 'Ninguém lançou despesas neste período.'
          : 'Ninguém lançou entregas nem despesas neste período.';

    if (linhas.length === 0) {
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
          {tipo === 'receitas' && r && (
            <TotalCard
              titulo="Total a pagar (todos)"
              totalGeral={r.totalGeral}
              quantidadeTotal={r.quantidadeTotal}
              filtro={filtro}
            />
          )}
          {tipo === 'despesas' && d && (
            <TotalCard
              titulo="Total de despesas (todos)"
              totalGeral={d.totalGeral}
              quantidadeTotal={d.quantidadeTotal}
              detalhe={formatLancamentos(d.quantidadeTotal)}
              filtro={filtro}
            />
          )}
          {tipo === 'ambos' && (
            <SaldoCard
              titulo="Saldo (todos)"
              receitas={r?.totalGeral ?? 0}
              despesas={d?.totalGeral ?? 0}
              filtro={filtro}
            />
          )}
          {semNada && (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-700">
              <FilterX className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              {avisoVazio}
            </p>
          )}
          <EquipeLista
            tipo={tipo}
            linhas={linhas}
            totalGeral={(tipo === 'despesas' ? d?.totalGeral : r?.totalGeral) ?? 0}
            linkPara={linkPara}
          />
        </div>
      );
    }
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
        <SegmentedControl label="Tipo" options={TIPOS} value={tipo} onChange={setTipo} />
        {secoes.some((s) => s.filtro.opcoes.length > 0) && (
          <CategoriasFiltroButton
            texto={textoBotaoFiltro(
              secoes.map(({ titulo, filtro }) => ({
                titulo,
                selecionadas: filtro.selecionadas,
                categorias: filtro.opcoes,
              })),
            )}
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
          secoes={secoes.map(({ titulo, filtro }) => ({
            titulo,
            opcoes: filtro.opcoes,
            selecionadas: filtro.selecionadas,
          }))}
          onClose={() => setFiltroAberto(false)}
          onAplicar={(porSecao) => {
            gravarFiltros(porSecao);
            setFiltroAberto(false);
          }}
        />
      )}
    </div>
  );
}
