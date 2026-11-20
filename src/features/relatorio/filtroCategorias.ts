/**
 * Filtro de categorias do relatório (spec 005, "Filtro por categorias").
 *
 * Estado canônico na URL: sem `cats` = todas; `?cats=id1,id2` = só essas.
 * Funções puras (sem React) para facilitar os testes.
 */
import type { FiltroCategorias } from './api';

export const CATS_PARAM = 'cats';
/** Filtro das categorias de despesa (spec 009), mesmo formato de `cats`. */
export const DCATS_PARAM = 'dcats';
/**
 * Valor de `cats`/`dcats` para "nenhuma categoria desta seção". Só acontece em
 * "Ambos" (duas seções no filtro), ex.: desmarcar a única categoria de despesa.
 * IDs são uuids, então não há colisão.
 */
export const NENHUMA = 'nenhuma';

export const FILTRO_MESSAGES = {
  semSelecao: 'Selecione ao menos uma categoria',
  vazio: 'Nenhum lançamento destas categorias neste período',
  vazioDespesas: 'Nenhuma despesa destas categorias neste período',
} as const;

/** IDs crus de `?cats=` (ou `param`), sem vazios nem repetidos, na ordem da URL. */
export function catsFromSearchParams(params: URLSearchParams, param = CATS_PARAM): string[] {
  const raw = params.get(param);
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * Seleção efetiva a partir dos IDs da URL e das categorias existentes:
 * - IDs desconhecidos (ex.: categoria excluída) são ignorados;
 * - se não sobrar nenhum, ou se sobrarem todas, vale `null` (= todas).
 * Devolve os IDs na ordem de `idsExistentes` (ordem da checklist).
 */
export function resolverSelecao(
  idsUrl: readonly string[],
  idsExistentes: readonly string[],
): FiltroCategorias {
  if (idsUrl.length === 0) return null;
  const pedidos = new Set(idsUrl);
  const validos = idsExistentes.filter((id) => pedidos.has(id));
  if (validos.length === 0 || validos.length === idsExistentes.length) return null;
  return validos;
}

/** A URL pede "nenhuma categoria" em `param` (`?dcats=nenhuma`)? */
export function pedeNenhuma(params: URLSearchParams, param = CATS_PARAM): boolean {
  return params.get(param) === NENHUMA;
}

/**
 * Grava a seleção em `params` (cópia), em `cats` ou em `param` (ex.: `dcats`).
 * Marcar todas (ou passar `null`) remove o parâmetro; `[]` grava `nenhuma`.
 */
export function withCats(
  params: URLSearchParams,
  selecionadas: readonly string[] | null,
  idsExistentes: readonly string[],
  param = CATS_PARAM,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (selecionadas && selecionadas.length === 0) {
    next.set(param, NENHUMA);
    return next;
  }
  const efetiva = selecionadas ? resolverSelecao(selecionadas, idsExistentes) : null;
  if (efetiva) next.set(param, efetiva.join(','));
  else next.delete(param);
  return next;
}

/** Parte da query key: IDs ordenados (independe da ordem da URL), `'todas'` ou `'nenhuma'`. */
export function catsQueryKey(categorias: FiltroCategorias): string {
  if (!categorias) return 'todas';
  if (categorias.length === 0) return NENHUMA;
  return [...categorias].sort().join(',');
}

/** Query string legível: mantém as vírgulas de `cats` sem escapar (`%2C`). */
export function toSearchString(params: URLSearchParams): string {
  const s = params.toString().replace(/%2C/gi, ',');
  return s ? `?${s}` : '';
}

/** "Todas" / "Nenhuma" / "Sanduíche" (uma só) / "2 de 5". */
export function rotuloFiltro(
  selecionadas: FiltroCategorias,
  categorias: ReadonlyArray<{ id: string; nome: string }>,
): string {
  if (!selecionadas) return 'Todas';
  if (selecionadas.length === 0) return 'Nenhuma';
  if (selecionadas.length === 1) {
    const unica = categorias.find((c) => c.id === selecionadas[0]);
    if (unica) return unica.nome;
  }
  return `${selecionadas.length} de ${categorias.length}`;
}

/** Seção do filtro (Entregas ou Despesas) para o texto do botão. */
export type SecaoRotulo = {
  titulo: string;
  selecionadas: FiltroCategorias;
  categorias: ReadonlyArray<{ id: string; nome: string }>;
};

/**
 * Texto do botão de filtro, refletindo as seções visíveis (spec 009):
 * - uma seção: "Categorias: Todas" / "Categorias: Pizza" / "Categorias: 2 de 5";
 * - duas, sem filtro: "Categorias: Todas";
 * - duas, com filtro: "Entregas: Todas · Despesas: Nenhuma".
 */
export function textoBotaoFiltro(secoes: readonly SecaoRotulo[]): string {
  if (secoes.length === 1) {
    return `Categorias: ${rotuloFiltro(secoes[0].selecionadas, secoes[0].categorias)}`;
  }
  if (secoes.every((s) => s.selecionadas === null)) return 'Categorias: Todas';
  return secoes
    .map((s) => `${s.titulo}: ${rotuloFiltro(s.selecionadas, s.categorias)}`)
    .join(' · ');
}
