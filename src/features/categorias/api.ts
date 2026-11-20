import type { Tables, TablesUpdate } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { CATEGORIA_ERROR_MESSAGES, toCategoriaError } from './errors';

export type Categoria = Tables<'categorias'>;
/** `user_id` = dono da categoria (o próprio usuário ou, para o gestor, o entregador alvo). */
export type CategoriaInsert = {
  user_id: string;
  nome: string;
  valor_unitario: number;
  ativa?: boolean;
};
export type CategoriaPatch = Pick<TablesUpdate<'categorias'>, 'nome' | 'valor_unitario' | 'ativa'>;

export type ListCategoriasParams = { incluirInativas?: boolean };

/**
 * Categorias de `userId`: ativas primeiro, depois por nome. O filtro por
 * `user_id` é obrigatório: para o gestor a RLS libera as categorias de todos (spec 008).
 */
export async function listCategorias(
  userId: string,
  { incluirInativas = false }: ListCategoriasParams = {},
): Promise<Categoria[]> {
  let query = supabase.from('categorias').select('*').eq('user_id', userId);
  if (!incluirInativas) query = query.eq('ativa', true);
  const { data, error } = await query
    .order('ativa', { ascending: false })
    .order('nome', { ascending: true });
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.carregar);
  return data ?? [];
}

/** Cria a categoria para `input.user_id` (a RLS só aceita o próprio id ou, para o gestor, qualquer um). */
export async function createCategoria(input: CategoriaInsert): Promise<Categoria> {
  const { data, error } = await supabase
    .from('categorias')
    .insert({
      user_id: input.user_id,
      nome: input.nome.trim(),
      valor_unitario: input.valor_unitario,
      ativa: input.ativa,
    })
    .select()
    .single();
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.salvar);
  return data;
}

/** Atualiza nome/valor/ativa. Reajuste não altera lançamentos antigos (preço congelado). */
export async function updateCategoria(id: string, patch: CategoriaPatch): Promise<Categoria> {
  const body: CategoriaPatch = { ...patch };
  if (body.nome !== undefined) body.nome = body.nome.trim();
  const { data, error } = await supabase
    .from('categorias')
    .update(body)
    .eq('id', id)
    .select()
    .single();
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.salvar);
  return data;
}

/** Exclui. Com lançamentos, o banco bloqueia (23503) → `CategoriaError` kind `em_uso`. */
export async function deleteCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.excluir);
}

/**
 * Nomes de todas as categorias visíveis (para o gestor, de todos os usuários).
 * Usado no filtro por nome da tela Equipe.
 */
export async function listNomesCategorias(): Promise<string[]> {
  const { data, error } = await supabase.from('categorias').select('nome');
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.carregar);
  return (data ?? []).map((r) => r.nome);
}
