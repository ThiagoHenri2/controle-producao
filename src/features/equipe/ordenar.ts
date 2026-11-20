import type { ResumoUsuario } from './api';

/** Sem produção no período (vai para o fim, esmaecido). */
export function semProducao(u: Pick<ResumoUsuario, 'quantidade' | 'valor'>): boolean {
  return Number(u.quantidade) === 0 && Number(u.valor) === 0;
}

/** Quem produziu primeiro (na ordem da RPC: valor desc, nome); quem tem 0 no fim. */
export function ordenarEquipe(usuarios: readonly ResumoUsuario[]): ResumoUsuario[] {
  return [...usuarios.filter((u) => !semProducao(u)), ...usuarios.filter((u) => semProducao(u))];
}
