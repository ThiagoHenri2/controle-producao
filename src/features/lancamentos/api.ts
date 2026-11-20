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

/** Lançamentos do usuário logado (RLS) num dia `yyyy-MM-dd`, na ordem em que foram feitos. */
export async function listLancamentosDoDia(data: string): Promise<LancamentoComCategoria[]> {
  const { data: rows, error } = await supabase
    .from('lancamentos')
    .select(SELECT_COM_CATEGORIA)
    .eq('data', data)
    .order('created_at', { ascending: true });
  if (error) throw toLancamentoError(error, LANCAMENTO_ERROR_MESSAGES.carregar);
  return rows ?? [];
}

/**
 * Grava vários lançamentos num único insert (tudo ou nada). Envia só
 * `data`, `categoria_id` e `quantidade`; `user_id` vem do default `auth.uid()`
 * e `valor_unitario` do trigger `lancamentos_preco_snapshot`.
 */
export async function createLancamentos(
  data: string,
  itens: ReadonlyArray<NovoLancamentoItem>,
): Promise<LancamentoComCategoria[]> {
  if (itens.length === 0) return [];
  const { data: rows, error } = await supabase
    .from('lancamentos')
    .insert(itens.map((i) => ({ data, categoria_id: i.categoria_id, quantidade: i.quantidade })))
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
