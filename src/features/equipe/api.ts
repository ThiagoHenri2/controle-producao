import type { AdminUser } from '@/features/admin/api';
import type { FiltroCategorias } from '@/features/relatorio/api';
import { toRelatorioError } from '@/features/relatorio/errors';
import type { ResumoUsuarioRow } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** Perfil listado ao gestor (a RLS da 0006 libera `profiles` para gerente/admin). */
export type Perfil = AdminUser;

export type ResumoUsuario = ResumoUsuarioRow;

export type ResumoEquipe = {
  /** Um por perfil (inclusive quem tem 0), ordenado por valor desc, nome (pela RPC). */
  usuarios: ResumoUsuario[];
  /** `total_geral` calculado pelo banco: soma de todos. */
  totalGeral: number;
  /** Soma das quantidades (inteiros, sem risco de arredondamento). */
  quantidadeTotal: number;
};

/**
 * Quanto pagar a cada entregador no período (só gestor; senão 42501).
 * `nomes`: `null` = todas as categorias (`resumo_por_usuario`); um array de nomes
 * normalizados = só as categorias com esses nomes, de todos (`resumo_por_usuario_nomes`).
 */
export async function fetchResumoEquipe(
  de: string,
  ate: string,
  nomes: FiltroCategorias = null,
): Promise<ResumoEquipe> {
  const { data, error } = nomes
    ? await supabase.rpc('resumo_por_usuario_nomes', { p_de: de, p_ate: ate, p_nomes: [...nomes] })
    : await supabase.rpc('resumo_por_usuario', { p_de: de, p_ate: ate });
  if (error) throw toRelatorioError(error);
  return montarResumoEquipe(data ?? []);
}

function montarResumoEquipe(usuarios: ResumoUsuario[]): ResumoEquipe {
  return {
    usuarios,
    totalGeral: Number(usuarios[0]?.total_geral ?? 0),
    quantidadeTotal: usuarios.reduce((soma, u) => soma + Number(u.quantidade), 0),
  };
}

/**
 * Despesas de cada entregador no período (spec 009, só gestor; senão 42501).
 * `quantidade` = nº de despesas. `nomes`: `null` = todas as categorias de despesa
 * (`p_nomes` omitido); um array de nomes normalizados = só essas; `[]` = nenhuma.
 */
export async function fetchResumoEquipeDespesas(
  de: string,
  ate: string,
  nomes: FiltroCategorias = null,
): Promise<ResumoEquipe> {
  const { data, error } = await supabase.rpc(
    'resumo_despesas_por_usuario_nomes',
    nomes ? { p_de: de, p_ate: ate, p_nomes: [...nomes] } : { p_de: de, p_ate: ate },
  );
  if (error) throw toRelatorioError(error);
  return montarResumoEquipe(data ?? []);
}
