import type { TipoRelatorio } from '@/features/relatorio/tipo';
import { toCentavos } from '@/lib/format';
import type { ResumoUsuario } from './api';

/** Sem produção no período (vai para o fim, esmaecido). */
export function semProducao(u: Pick<ResumoUsuario, 'quantidade' | 'valor'>): boolean {
  return Number(u.quantidade) === 0 && Number(u.valor) === 0;
}

/** Quem produziu primeiro (na ordem da RPC: valor desc, nome); quem tem 0 no fim. */
export function ordenarEquipe(usuarios: readonly ResumoUsuario[]): ResumoUsuario[] {
  return [...usuarios.filter((u) => !semProducao(u)), ...usuarios.filter((u) => semProducao(u))];
}

/**
 * Linha da tela Equipe com receitas, despesas e saldo (spec 009), em centavos.
 * `entregas` = nº de entregas; `despesasQtd` = nº de despesas.
 */
export type LinhaEquipe = Pick<
  ResumoUsuario,
  'user_id' | 'nome' | 'username' | 'role' | 'ativo'
> & {
  receitas: number;
  despesas: number;
  saldo: number;
  entregas: number;
  despesasQtd: number;
  /** Sem nada no tipo selecionado (vai para o fim, esmaecido). */
  zero: boolean;
};

/**
 * Junta os resumos por usuário (merge por `user_id`, em centavos) e ordena pelo
 * valor do tipo: receitas e despesas mantêm a ordem da RPC (valor desc, nome);
 * Ambos ordena por saldo desc, nome. Quem não tem nada no tipo fica no fim.
 */
export function combinarEquipe(
  tipo: TipoRelatorio,
  receitas: readonly ResumoUsuario[],
  despesas: readonly ResumoUsuario[],
): LinhaEquipe[] {
  const base = tipo === 'despesas' ? despesas : receitas;
  const outra = new Map((tipo === 'despesas' ? receitas : despesas).map((u) => [u.user_id, u]));
  // Perfis que só aparecem na outra lista (não deveria acontecer: as RPCs listam todos).
  const ids = new Set(base.map((u) => u.user_id));
  const extras = [...outra.values()].filter((u) => !ids.has(u.user_id));
  const rec = new Map(receitas.map((u) => [u.user_id, u]));
  const desp = new Map(despesas.map((u) => [u.user_id, u]));

  const linhas = [...base, ...extras].map((u): LinhaEquipe => {
    const r = rec.get(u.user_id);
    const d = desp.get(u.user_id);
    const receitasC = r ? toCentavos(r.valor) : 0;
    const despesasC = d ? toCentavos(d.valor) : 0;
    const zeroR = !r || semProducao(r);
    const zeroD = !d || semProducao(d);
    return {
      user_id: u.user_id,
      nome: u.nome,
      username: u.username,
      role: u.role,
      ativo: u.ativo,
      receitas: receitasC,
      despesas: despesasC,
      saldo: receitasC - despesasC,
      entregas: r ? Number(r.quantidade) : 0,
      despesasQtd: d ? Number(d.quantidade) : 0,
      zero: tipo === 'receitas' ? zeroR : tipo === 'despesas' ? zeroD : zeroR && zeroD,
    };
  });

  const ordenadas =
    tipo === 'ambos'
      ? [...linhas].sort(
          (a, b) =>
            b.saldo - a.saldo ||
            a.nome.localeCompare(b.nome, 'pt-BR') ||
            a.username.localeCompare(b.username, 'pt-BR'),
        )
      : linhas;
  return [...ordenadas.filter((l) => !l.zero), ...ordenadas.filter((l) => l.zero)];
}
