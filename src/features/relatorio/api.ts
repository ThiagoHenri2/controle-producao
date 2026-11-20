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

export async function fetchResumoPorCategoria(de: string, ate: string): Promise<ResumoCategoria[]> {
  const { data, error } = await supabase.rpc('resumo_por_categoria', { p_de: de, p_ate: ate });
  if (error) throw toRelatorioError(error);
  return data ?? [];
}

export async function fetchResumoPorDia(de: string, ate: string): Promise<ResumoDia[]> {
  const { data, error } = await supabase.rpc('resumo_por_dia', { p_de: de, p_ate: ate });
  if (error) throw toRelatorioError(error);
  return data ?? [];
}

/** Chama as duas RPCs em paralelo. Valores e total vêm prontos do banco (RLS por usuário). */
export async function fetchResumo(de: string, ate: string): Promise<Resumo> {
  const [categorias, dias] = await Promise.all([
    fetchResumoPorCategoria(de, ate),
    fetchResumoPorDia(de, ate),
  ]);
  return {
    categorias,
    dias,
    totalGeral: Number(categorias[0]?.total_geral ?? 0),
    quantidadeTotal: categorias.reduce((soma, c) => soma + Number(c.quantidade), 0),
  };
}
