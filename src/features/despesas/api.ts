import { CATEGORIA_ERROR_MESSAGES, toCategoriaError } from '@/features/categorias/errors';
import type { Tables, TablesUpdate } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { DESPESA_ERROR_MESSAGES, toDespesaError } from './errors';

// ---------------------------------------------------------------------------
// Categorias de despesa (spec 009): só nome e ativa, sem valor.
// ---------------------------------------------------------------------------

export type CategoriaDespesa = Tables<'categorias_despesa'>;
export type CategoriaDespesaInsert = { user_id: string; nome: string; ativa?: boolean };
export type CategoriaDespesaPatch = Pick<TablesUpdate<'categorias_despesa'>, 'nome' | 'ativa'>;

/**
 * Categorias de despesa de `userId`: ativas primeiro, depois por nome. O filtro
 * por `user_id` é obrigatório: para o gestor a RLS libera as de todos.
 */
export async function listCategoriasDespesa(
  userId: string,
  { incluirInativas = false }: { incluirInativas?: boolean } = {},
): Promise<CategoriaDespesa[]> {
  let query = supabase.from('categorias_despesa').select('*').eq('user_id', userId);
  if (!incluirInativas) query = query.eq('ativa', true);
  const { data, error } = await query
    .order('ativa', { ascending: false })
    .order('nome', { ascending: true });
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.carregar);
  return data ?? [];
}

export async function createCategoriaDespesa(
  input: CategoriaDespesaInsert,
): Promise<CategoriaDespesa> {
  const { data, error } = await supabase
    .from('categorias_despesa')
    .insert({ user_id: input.user_id, nome: input.nome.trim(), ativa: input.ativa })
    .select()
    .single();
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.salvar);
  return data;
}

export async function updateCategoriaDespesa(
  id: string,
  patch: CategoriaDespesaPatch,
): Promise<CategoriaDespesa> {
  const body: CategoriaDespesaPatch = {};
  if (patch.nome !== undefined) body.nome = patch.nome.trim();
  if (patch.ativa !== undefined) body.ativa = patch.ativa;
  const { data, error } = await supabase
    .from('categorias_despesa')
    .update(body)
    .eq('id', id)
    .select()
    .single();
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.salvar);
  return data;
}

/** Exclui. Com despesas, o banco bloqueia (23503; 23001 por robustez) → kind `em_uso`. */
export async function deleteCategoriaDespesa(id: string): Promise<void> {
  const { error } = await supabase.from('categorias_despesa').delete().eq('id', id);
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.excluir);
}

/** Nomes de todas as categorias de despesa visíveis (filtro "Despesas" da Equipe). */
export async function listNomesCategoriasDespesa(): Promise<string[]> {
  const { data, error } = await supabase.from('categorias_despesa').select('nome');
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.carregar);
  return (data ?? []).map((r) => r.nome);
}

// ---------------------------------------------------------------------------
// Despesas
// ---------------------------------------------------------------------------

export type Despesa = Tables<'despesas'>;
/** Despesa com o nome da categoria (join). */
export type DespesaComCategoria = Despesa & { categoria: { nome: string } | null };

/**
 * Nova despesa. Sem `criado_por`: o trigger anti-forja grava `auth.uid()`.
 * `valor` em reais com 2 casas (vem de centavos inteiros).
 */
export type NovaDespesa = {
  user_id: string;
  data: string;
  categoria_despesa_id: string;
  valor: number;
  descricao: string | null;
};
export type DespesaPatch = {
  categoria_despesa_id: string;
  valor: number;
  descricao: string | null;
};

const SELECT_COM_CATEGORIA = '*, categoria:categorias_despesa(nome)' as const;

/** Despesas de `userId` num dia `yyyy-MM-dd`, na ordem em que foram feitas. */
export async function listDespesasDoDia(
  userId: string,
  data: string,
): Promise<DespesaComCategoria[]> {
  const { data: rows, error } = await supabase
    .from('despesas')
    .select(SELECT_COM_CATEGORIA)
    .eq('user_id', userId)
    .eq('data', data)
    .order('created_at', { ascending: true });
  if (error) throw toDespesaError(error, DESPESA_ERROR_MESSAGES.carregar);
  return rows ?? [];
}

export async function createDespesa(input: NovaDespesa): Promise<DespesaComCategoria> {
  const { data: row, error } = await supabase
    .from('despesas')
    .insert({
      user_id: input.user_id,
      data: input.data,
      categoria_despesa_id: input.categoria_despesa_id,
      valor: input.valor,
      descricao: input.descricao,
    })
    .select(SELECT_COM_CATEGORIA)
    .single();
  if (error) throw toDespesaError(error, DESPESA_ERROR_MESSAGES.salvar);
  return row;
}

export async function updateDespesa(id: string, patch: DespesaPatch): Promise<DespesaComCategoria> {
  const { data: row, error } = await supabase
    .from('despesas')
    .update({
      categoria_despesa_id: patch.categoria_despesa_id,
      valor: patch.valor,
      descricao: patch.descricao,
    })
    .eq('id', id)
    .select(SELECT_COM_CATEGORIA)
    .single();
  if (error) throw toDespesaError(error, DESPESA_ERROR_MESSAGES.salvar);
  return row;
}

export async function deleteDespesa(id: string): Promise<void> {
  const { error } = await supabase.from('despesas').delete().eq('id', id);
  if (error) throw toDespesaError(error, DESPESA_ERROR_MESSAGES.excluir);
}
