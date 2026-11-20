/**
 * Filtro de categorias do relatório (spec 005, "Filtro por categorias").
 *
 * Estado canônico na URL: sem `cats` = todas; `?cats=id1,id2` = só essas.
 * Funções puras (sem React) para facilitar os testes.
 */
import type { FiltroCategorias } from './api';

export const CATS_PARAM = 'cats';

export const FILTRO_MESSAGES = {
  semSelecao: 'Selecione ao menos uma categoria',
  vazio: 'Nenhum lançamento destas categorias neste período',
} as const;

/** IDs crus de `?cats=` (sem vazios nem repetidos), na ordem da URL. */
export function catsFromSearchParams(params: URLSearchParams): string[] {
  const raw = params.get(CATS_PARAM);
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

/**
 * Grava a seleção em `params` (cópia). Marcar todas (ou passar `null`) remove `cats`.
 */
export function withCats(
  params: URLSearchParams,
  selecionadas: readonly string[] | null,
  idsExistentes: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(params);
  const efetiva = selecionadas ? resolverSelecao(selecionadas, idsExistentes) : null;
  if (efetiva) next.set(CATS_PARAM, efetiva.join(','));
  else next.delete(CATS_PARAM);
  return next;
}

/** Parte da query key: IDs ordenados (independe da ordem da URL) ou `'todas'`. */
export function catsQueryKey(categorias: FiltroCategorias): string {
  return categorias ? [...categorias].sort().join(',') : 'todas';
}

/** Query string legível: mantém as vírgulas de `cats` sem escapar (`%2C`). */
export function toSearchString(params: URLSearchParams): string {
  const s = params.toString().replace(/%2C/gi, ',');
  return s ? `?${s}` : '';
}

/** "Todas" / "Sanduíche" (uma só) / "2 de 5". */
export function rotuloFiltro(
  selecionadas: FiltroCategorias,
  categorias: ReadonlyArray<{ id: string; nome: string }>,
): string {
  if (!selecionadas) return 'Todas';
  if (selecionadas.length === 1) {
    const unica = categorias.find((c) => c.id === selecionadas[0]);
    if (unica) return unica.nome;
  }
  return `${selecionadas.length} de ${categorias.length}`;
}
