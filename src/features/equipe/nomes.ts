/**
 * Filtro por NOME de categoria da tela Equipe (spec 008). As categorias são por
 * entregador; o gestor filtra "Pizza de todo mundo" pela união dos nomes,
 * sem diferenciar maiúsculas nem espaços nas pontas (igual a `lower(btrim())` da RPC).
 * Funções puras (sem React).
 */
import type { FiltroCategorias } from '@/features/relatorio/api';
import type { OpcaoCategoria } from '@/features/relatorio/components/CategoriasSheet';
import { resolverSelecao } from '@/features/relatorio/filtroCategorias';

/** Parâmetro repetido na URL: `?nomes=pizza&nomes=sanduíche` (nomes podem ter vírgula). */
export const NOMES_PARAM = 'nomes';
/** Mesmo formato, para os nomes de categorias de despesa (spec 009). */
export const DNOMES_PARAM = 'dnomes';

/** Chave de agrupamento: trim + minúsculas. */
export function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Agrupa os nomes (um por categoria, de todos os usuários) pela chave normalizada.
 * Exibe a grafia mais comum (empate: ordem alfabética). Ordena por nome exibido.
 */
export function agruparNomes(nomes: readonly string[]): OpcaoCategoria[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const bruto of nomes) {
    const chave = normalizarNome(bruto);
    if (!chave) continue;
    const grafias = grupos.get(chave) ?? new Map<string, number>();
    const grafia = bruto.trim();
    grafias.set(grafia, (grafias.get(grafia) ?? 0) + 1);
    grupos.set(chave, grafias);
  }
  return [...grupos.entries()]
    .map(([id, grafias]) => {
      const [nome] = [...grafias.entries()].sort(
        ([a, na], [b, nb]) => nb - na || a.localeCompare(b, 'pt-BR'),
      )[0];
      return { id, nome };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Chaves normalizadas de `?nomes=` (ou `param`), sem vazias nem repetidas, na ordem da URL. */
export function nomesFromSearchParams(params: URLSearchParams, param = NOMES_PARAM): string[] {
  const chaves = params.getAll(param).map(normalizarNome).filter(Boolean);
  return [...new Set(chaves)];
}

/**
 * A URL pede "nenhum nome" em `param` (`?dnomes=` vazio)? Só acontece em
 * "Ambos", com as duas seções no filtro (ex.: desmarcar todas as despesas).
 */
export function pedeNenhumNome(params: URLSearchParams, param = NOMES_PARAM): boolean {
  const valores = params.getAll(param);
  return valores.length > 0 && valores.every((v) => v.trim() === '');
}

/**
 * Grava a seleção em `params` (cópia), em `nomes` ou em `param` (ex.: `dnomes`).
 * Marcar todos (ou `null`) remove o parâmetro; `[]` grava o parâmetro vazio
 * ("nenhum"). Chaves desconhecidas são descartadas.
 */
export function withNomes(
  params: URLSearchParams,
  selecionados: readonly string[] | null,
  existentes: readonly string[],
  param = NOMES_PARAM,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(param);
  if (selecionados && selecionados.length === 0) {
    next.append(param, '');
    return next;
  }
  const efetiva: FiltroCategorias = selecionados
    ? resolverSelecao(selecionados.map(normalizarNome), existentes)
    : null;
  efetiva?.forEach((chave) => next.append(param, chave));
  return next;
}
