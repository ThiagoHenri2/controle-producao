import type { Tables, TablesUpdate } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { CATEGORIA_ERROR_MESSAGES, toCategoriaError } from './errors';

export type Categoria = Tables<'categorias'>;
export type CategoriaInsert = { nome: string; valor_unitario: number; ativa?: boolean };
export type CategoriaPatch = Pick<TablesUpdate<'categorias'>, 'nome' | 'valor_unitario' | 'ativa'>;

export type ListCategoriasParams = { incluirInativas?: boolean };

/** Categorias do usuário logado (RLS): ativas primeiro, depois por nome. */
export async function listCategorias({
  incluirInativas = false,
}: ListCategoriasParams = {}): Promise<Categoria[]> {
  let query = supabase.from('categorias').select('*');
  if (!incluirInativas) query = query.eq('ativa', true);
  const { data, error } = await query
    .order('ativa', { ascending: false })
    .order('nome', { ascending: true });
  if (error) throw toCategoriaError(error, CATEGORIA_ERROR_MESSAGES.carregar);
  return data ?? [];
}

/** Cria a categoria. `user_id` vem do default `auth.uid()` do banco. */
export async function createCategoria(input: CategoriaInsert): Promise<Categoria> {
  const { data, error } = await supabase
    .from('categorias')
    .insert({ nome: input.nome.trim(), valor_unitario: input.valor_unitario, ativa: input.ativa })
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
