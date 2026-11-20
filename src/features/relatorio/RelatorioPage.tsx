import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, BarChart3, FilterX, Plus, Receipt } from 'lucide-react';
import { Button, EmptyState, SegmentedControl } from '@/components/ui';
import { searchComAba } from '@/features/despesas/aba';
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
import { ResumoDiasSaldo } from './components/ResumoDiasSaldo';
import { SaldoCard } from './components/SaldoCard';
import { TotalCard, type TotalCardFiltro } from './components/TotalCard';
import { FILTRO_MESSAGES, textoBotaoFiltro } from './filtroCategorias';
import { formatLancamentos } from './format';
import {
  useCategoriasFiltro,
  usePeriodoFiltro,
  useResumo,
  useResumoDespesas,
  useTipoRelatorio,
  useWriteSearchParams,
} from './hooks';
import { formatIntervalo } from './periodos';
import { combinarDias } from './saldo';
import { TIPOS, mostraDespesas, mostraReceitas } from './tipo';

type Filtro = ReturnType<typeof useCategoriasFiltro>;

/** Resumo do filtro para o card: quantas marcadas de quantas (somando as seções). */
function resumoFiltro(
  filtros: readonly Filtro[],
  onLimpar: () => void,
): TotalCardFiltro | undefined {
  if (filtros.every((f) => f.selecionadas === null)) return undefined;
  return {
    selecionadas: filtros.reduce(
      (s, f) => s + (f.selecionadas ? f.selecionadas.length : f.categorias.length),
      0,
    ),
    total: filtros.reduce((s, f) => s + f.categorias.length, 0),
    onLimpar,
  };
}

/**
 * Relatório (spec 005): total do período, por categoria e por dia, com filtro de categorias.
 * O gestor escolhe o entregador (`?usuario=`, `p_usuario`, spec 008).
 * Tipo Receitas | Despesas | Ambos (`?tipo=`, spec 009), com saldo em Ambos.
 */
export function RelatorioPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const write = useWriteSearchParams();
  const alvo = useUsuarioAlvo();
  const [tipo, setTipo] = useTipoRelatorio();
  const { periodo, hoje, escolherRapido, escolherPersonalizado } = usePeriodoFiltro();
  const comReceitas = mostraReceitas(tipo);
  const comDespesas = mostraDespesas(tipo);
  const filtroR = useCategoriasFiltro(alvo.alvoId, { tipo: 'entregas', enabled: comReceitas });
  const filtroD = useCategoriasFiltro(alvo.alvoId, { tipo: 'despesas', enabled: comDespesas });
  const opts = { usuarioId: alvo.alvoId, pUsuario: alvo.pUsuario };
  const receitas = useResumo(periodo.de, periodo.ate, filtroR.selecionadas, {
    ...opts,
    enabled: comReceitas && filtroR.pronto,
  });
  const despesas = useResumoDespesas(periodo.de, periodo.ate, filtroD.selecionadas, {
    ...opts,
    enabled: comDespesas && filtroD.pronto,
  });
  const [sheetAberto, setSheetAberto] = useState(false);
  const [filtroAberto, setFiltroAberto] = useState(false);

  // Seções do filtro conforme o tipo: Entregas (`cats`) e/ou Despesas (`dcats`).
  const secoes = [
    ...(comReceitas ? [{ titulo: 'Entregas', filtro: filtroR }] : []),
    ...(comDespesas ? [{ titulo: 'Despesas', filtro: filtroD }] : []),
  ];
  /** Grava as seções de uma vez na URL (`null` = todas). Seção sem opções não muda. */
  const gravarFiltros = (porSecao: ReadonlyArray<readonly string[] | null>) => {
    let params = searchParams;
    secoes.forEach(({ filtro }, i) => {
      if (filtro.categorias.length > 0) params = filtro.paramsCom(params, porSecao[i] ?? null);
    });
    write(params);
  };
  const limparFiltros = () => gravarFiltros(secoes.map(() => null));
  const temOpcoes = secoes.some((s) => s.filtro.categorias.length > 0);

  const tentarDeNovo = (erro: { message: string }, refetch: () => void, carregando: boolean) => (
    <EmptyState
      icon={AlertCircle}
      title={erro.message}
      description="Verifique sua conexão e tente de novo."
      action={
        <Button fullWidth variant="secondary" loading={carregando} onClick={refetch}>
          Tentar de novo
        </Button>
      }
    />
  );

  const vazioFiltro = (titulo: string) => (
    <EmptyState
      icon={FilterX}
      title={titulo}
      description="Marque outras categorias ou escolha outro período."
      action={
        <Button fullWidth variant="secondary" onClick={limparFiltros}>
          Limpar filtro
        </Button>
      }
    />
  );

  const lancarEntregas = (
    <Button
      fullWidth
      leftIcon={<Plus className="h-5 w-5" aria-hidden />}
      onClick={() => navigate({ pathname: ROUTES.lancar, search: alvo.search })}
    >
      Lançar entregas
    </Button>
  );

  let conteudo: ReactNode;
  if (tipo === 'receitas') {
    const { data, isPending, isError, error, refetch, isRefetching } = receitas;
    if (isPending) {
      conteudo = <RelatorioSkeleton />;
    } else if (isError) {
      conteudo = tentarDeNovo(error, () => refetch(), isRefetching);
    } else if (data.categorias.length === 0 && filtroR.selecionadas !== null) {
      conteudo = vazioFiltro(FILTRO_MESSAGES.vazio);
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
          action={lancarEntregas}
        />
      );
    } else {
      conteudo = (
        <div className="flex flex-col gap-5">
          <TotalCard
            totalGeral={data.totalGeral}
            quantidadeTotal={data.quantidadeTotal}
            filtro={resumoFiltro([filtroR], filtroR.limpar)}
          />
          <ResumoCategorias categorias={data.categorias} totalGeral={data.totalGeral} />
          {data.dias.length > 0 && <ResumoDias dias={data.dias} />}
        </div>
      );
    }
  } else if (tipo === 'despesas') {
    const { data, isPending, isError, error, refetch, isRefetching } = despesas;
    if (isPending) {
      conteudo = <RelatorioSkeleton />;
    } else if (isError) {
      conteudo = tentarDeNovo(error, () => refetch(), isRefetching);
    } else if (data.categorias.length === 0 && filtroD.selecionadas !== null) {
      conteudo = vazioFiltro(FILTRO_MESSAGES.vazioDespesas);
    } else if (data.categorias.length === 0) {
      conteudo = (
        <EmptyState
          icon={Receipt}
          title="Nenhuma despesa neste período"
          description={
            alvo.isEu
              ? 'Lance suas despesas ou escolha outro período.'
              : `${alvo.alvoNome} não tem despesas neste período.`
          }
          action={
            <Button
              fullWidth
              leftIcon={<Plus className="h-5 w-5" aria-hidden />}
              onClick={() =>
                navigate({
                  pathname: ROUTES.lancar,
                  search: searchComAba(alvo.search, 'despesas'),
                })
              }
            >
              Lançar despesas
            </Button>
          }
        />
      );
    } else {
      conteudo = (
        <div className="flex flex-col gap-5">
          <TotalCard
            titulo="Total de despesas"
            totalGeral={data.totalGeral}
            quantidadeTotal={data.quantidadeTotal}
            detalhe={formatLancamentos(data.quantidadeTotal)}
            filtro={resumoFiltro([filtroD], filtroD.limpar)}
          />
          <ResumoCategorias
            categorias={data.categorias}
            totalGeral={data.totalGeral}
            unidade={formatLancamentos}
            cor="danger"
          />
          {data.dias.length > 0 && <ResumoDias dias={data.dias} unidade={formatLancamentos} />}
        </div>
      );
    }
  } else if (receitas.isPending || despesas.isPending) {
    conteudo = <RelatorioSkeleton />;
  } else if (receitas.isError || despesas.isError) {
    const erro = receitas.error ?? despesas.error;
    conteudo = tentarDeNovo(
      erro ?? { message: '' },
      () => {
        if (receitas.isError) void receitas.refetch();
        if (despesas.isError) void despesas.refetch();
      },
      receitas.isRefetching || despesas.isRefetching,
    );
  } else {
    const r = receitas.data;
    const d = despesas.data;
    const filtro = resumoFiltro([filtroR, filtroD], limparFiltros);
    if (r.categorias.length === 0 && d.categorias.length === 0) {
      conteudo = filtro ? (
        vazioFiltro(FILTRO_MESSAGES.vazio)
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Nenhum lançamento neste período"
          description={
            alvo.isEu
              ? 'Lance suas entregas e despesas ou escolha outro período.'
              : `${alvo.alvoNome} não tem lançamentos neste período.`
          }
          action={lancarEntregas}
        />
      );
    } else {
      const dias = combinarDias(r.dias, d.dias);
      conteudo = (
        <div className="flex flex-col gap-5">
          <SaldoCard receitas={r.totalGeral} despesas={d.totalGeral} filtro={filtro} />
          {r.categorias.length > 0 ? (
            <ResumoCategorias
              titulo="Entregas"
              categorias={r.categorias}
              totalGeral={r.totalGeral}
            />
          ) : (
            <SecaoVazia titulo="Entregas" texto="Nenhuma entrega neste período." />
          )}
          {d.categorias.length > 0 ? (
            <ResumoCategorias
              titulo="Despesas"
              categorias={d.categorias}
              totalGeral={d.totalGeral}
              unidade={formatLancamentos}
              cor="danger"
            />
          ) : (
            <SecaoVazia titulo="Despesas" texto="Nenhuma despesa neste período." />
          )}
          {dias.length > 0 && <ResumoDiasSaldo dias={dias} />}
        </div>
      );
    }
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
        <SegmentedControl label="Tipo" options={TIPOS} value={tipo} onChange={setTipo} />
        {temOpcoes && (
          <CategoriasFiltroButton
            texto={textoBotaoFiltro(
              secoes.map(({ titulo, filtro }) => ({
                titulo,
                selecionadas: filtro.selecionadas,
                categorias: filtro.categorias,
              })),
            )}
            ativo={secoes.some((s) => s.filtro.selecionadas !== null)}
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
            opcoes: filtro.categorias,
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

/** Seção do "Ambos" sem dados (mantém o título para o usuário se localizar). */
function SecaoVazia({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
      <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
        {texto}
      </p>
    </section>
  );
}
