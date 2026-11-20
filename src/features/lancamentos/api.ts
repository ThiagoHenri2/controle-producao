import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { LANCAMENTO_ERROR_MESSAGES, toLancamentoError } from './errors';

export type Lancamento = Tables<'lancamentos'>;
/** Lançamento com o nome da categoria (join). */
export type LancamentoComCategoria = Lancamento & { categoria: { nome: string } | null };

/** Item do envio em lote. Sem `valor_unitario`: o trigger congela o preço da categoria. */
export type NovoLancamentoItem = { categoria_id: string; quantidade: number };
export type LancamentoPatch = { quantidade: number; observacao: string | null };

const SELECT_COM_CATEGORIA = '*, categoria:categorias(nome)' as const;

/**
 * Lançamentos de `userId` num dia `yyyy-MM-dd`, na ordem em que foram feitos.
 * O filtro por `user_id` é obrigatório: para o gestor a RLS libera os de todos (spec 008).
 */
export async function listLancamentosDoDia(
  userId: string,
  data: string,
): Promise<LancamentoComCategoria[]> {
  const { data: rows, error } = await supabase
    .from('lancamentos')
    .select(SELECT_COM_CATEGORIA)
    .eq('user_id', userId)
    .eq('data', data)
    .order('created_at', { ascending: true });
  if (error) throw toLancamentoError(error, LANCAMENTO_ERROR_MESSAGES.carregar);
  return rows ?? [];
}

/**
 * Grava vários lançamentos de `userId` num único insert (tudo ou nada). Envia só
 * `user_id`, `data`, `categoria_id` e `quantidade`: `valor_unitario` vem do trigger
 * `lancamentos_preco_snapshot` (categoria do mesmo `user_id`) e `criado_por` do
 * trigger anti-forja (`auth.uid()`, spec 008).
 */
export async function createLancamentos(
  userId: string,
  data: string,
  itens: ReadonlyArray<NovoLancamentoItem>,
): Promise<LancamentoComCategoria[]> {
  if (itens.length === 0) return [];
  const { data: rows, error } = await supabase
    .from('lancamentos')
    .insert(
      itens.map((i) => ({
        user_id: userId,
        data,
        categoria_id: i.categoria_id,
        quantidade: i.quantidade,
      })),
    )
    .select(SELECT_COM_CATEGORIA);
  if (error) throw toLancamentoError(error, LANCAMENTO_ERROR_MESSAGES.salvar);
  return rows ?? [];
}

/** Altera quantidade e observação. O preço congelado não muda. */
export async function updateLancamento(
  id: string,
  patch: LancamentoPatch,
): Promise<LancamentoComCategoria> {
  const { data: row, error } = await supabase
    .from('lancamentos')
    .update({ quantidade: patch.quantidade, observacao: patch.observacao })
    .eq('id', id)
    .select(SELECT_COM_CATEGORIA)
    .single();
  if (error) throw toLancamentoError(error, LANCAMENTO_ERROR_MESSAGES.salvar);
  return row;
}

export async function deleteLancamento(id: string): Promise<void> {
  const { error } = await supabase.from('lancamentos').delete().eq('id', id);
  if (error) throw toLancamentoError(error, LANCAMENTO_ERROR_MESSAGES.excluir);
}

export type Autor = { id: string; nome: string };

/**
 * Nomes dos autores (`criado_por`) para o selo "por <nome>" (RPC `autores`,
 * spec 008). Só devolve autores de lançamentos visíveis ao chamador.
 */
export async function fetchAutores(ids: readonly string[]): Promise<Autor[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('autores', { p_ids: [...ids] });
  if (error) throw toLancamentoError(error, LANCAMENTO_ERROR_MESSAGES.carregar);
  return data ?? [];
}

/** Ids (ordenados, sem repetição) dos autores que não são o dono do lançamento. */
export function idsDeOutrosAutores(
  rows: ReadonlyArray<Pick<Lancamento, 'user_id' | 'criado_por'>>,
): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.criado_por && r.criado_por !== r.user_id) ids.add(r.criado_por);
  }
  return [...ids].sort();
}
