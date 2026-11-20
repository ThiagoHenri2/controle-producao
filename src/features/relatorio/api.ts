import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { toRelatorioError } from './errors';

type Functions = Database['public']['Functions'];
export type ResumoCategoria = Functions['resumo_por_categoria']['Returns'][number];
export type ResumoDia = Functions['resumo_por_dia']['Returns'][number];

export type Resumo = {
  /** Ordenado por valor desc, nome (pela RPC). */
  categorias: ResumoCategoria[];
  /** Ordenado por data desc (pela RPC). */
  dias: ResumoDia[];
  /** `total_geral` calculado pelo banco (soma de `valor_total`). */
  totalGeral: number;
  /** Soma das quantidades (inteiros, sem risco de arredondamento). */
  quantidadeTotal: number;
};

/**
 * Filtro de categorias enviado às RPCs: `null` = todas (o parâmetro é omitido e
 * o banco usa o default `null`); um array = só essas categorias.
 */
export type FiltroCategorias = readonly string[] | null;

/**
 * Usuário do relatório enviado às RPCs (spec 008): `null` = o próprio (o
 * parâmetro `p_usuario` é omitido); um id = esse entregador (só gestor; senão 42501).
 */
export type UsuarioResumo = string | null;

type ResumoArgs = Functions['resumo_por_categoria']['Args'];

function resumoArgs(
  de: string,
  ate: string,
  categorias: FiltroCategorias,
  usuario: UsuarioResumo,
): ResumoArgs {
  const args: ResumoArgs = { p_de: de, p_ate: ate };
  if (categorias) args.p_categorias = [...categorias];
  if (usuario) args.p_usuario = usuario;
  return args;
}

export async function fetchResumoPorCategoria(
  de: string,
  ate: string,
  categorias: FiltroCategorias = null,
  usuario: UsuarioResumo = null,
): Promise<ResumoCategoria[]> {
  const { data, error } = await supabase.rpc(
    'resumo_por_categoria',
    resumoArgs(de, ate, categorias, usuario),
  );
  if (error) throw toRelatorioError(error);
  return data ?? [];
}

export async function fetchResumoPorDia(
  de: string,
  ate: string,
  categorias: FiltroCategorias = null,
  usuario: UsuarioResumo = null,
): Promise<ResumoDia[]> {
  const { data, error } = await supabase.rpc(
    'resumo_por_dia',
    resumoArgs(de, ate, categorias, usuario),
  );
  if (error) throw toRelatorioError(error);
  return data ?? [];
}

/**
 * Chama as duas RPCs em paralelo. Valores e total vêm prontos do banco, já
 * filtrados pelas categorias quando houver filtro. `usuario` (só gestor) escolhe o entregador.
 */
export async function fetchResumo(
  de: string,
  ate: string,
  categorias: FiltroCategorias = null,
  usuario: UsuarioResumo = null,
): Promise<Resumo> {
  const [porCategoria, dias] = await Promise.all([
    fetchResumoPorCategoria(de, ate, categorias, usuario),
    fetchResumoPorDia(de, ate, categorias, usuario),
  ]);
  return {
    categorias: porCategoria,
    dias,
    totalGeral: Number(porCategoria[0]?.total_geral ?? 0),
    quantidadeTotal: porCategoria.reduce((soma, c) => soma + Number(c.quantidade), 0),
  };
}
