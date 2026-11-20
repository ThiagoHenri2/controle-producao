/**
 * RPCs `resumo_por_usuario` e `resumo_por_usuario_nomes` (migration 0006) em
 * memória, para testes. Registre com `fakeEquipe.register(fakeSupabase)`.
 *
 * Como no banco: inclui TODOS os perfis (com 0 quando não produziram), soma em
 * centavos inteiros, ordena por valor desc, nome, username e devolve `total_geral`
 * em todas as linhas. O filtro por nome ignora maiúsculas e espaços nas pontas.
 * Quem não é gestor (`setGestor(false)`) recebe 42501.
 */
import type { ResumoUsuarioRow } from '@/lib/database.types';
import type { RpcHandler, RpcResult } from '@/test/supabaseMock';
import type { Perfil } from '../api';

export type FakeLancamentoEquipe = {
  user_id: string;
  data: string;
  /** Nome da categoria do dono (as categorias são por usuário). */
  categoria: string;
  quantidade: number;
  /** Preço congelado, em centavos. */
  valor_unitario_centavos: number;
};

type RpcRegistry = { setRpcHandler: (fn: string, handler: RpcHandler) => void };

export type FakeEquipeCall = { fn: string; de: string; ate: string; nomes?: string[] };

const norm = (s: string) => s.trim().toLowerCase();

export function createFakeEquipe() {
  let perfis: Perfil[] = [];
  let lancamentos: FakeLancamentoEquipe[] = [];
  let gestor = true;
  const calls: FakeEquipeCall[] = [];

  function resumo(fn: string, args: Record<string, unknown>): RpcResult {
    if (!gestor) return { data: null, error: { code: '42501', message: 'Acesso negado' } };
    const de = String(args.p_de ?? '');
    const ate = String(args.p_ate ?? '');
    const nomes = Array.isArray(args.p_nomes) ? args.p_nomes.map((n) => norm(String(n))) : null;
    calls.push(nomes ? { fn, de, ate, nomes } : { fn, de, ate });

    const linhas = perfis.map((p) => {
      const meus = lancamentos.filter(
        (l) =>
          l.user_id === p.id &&
          l.data >= de &&
          l.data <= ate &&
          (!nomes || nomes.includes(norm(l.categoria))),
      );
      return {
        perfil: p,
        qtd: meus.reduce((s, l) => s + l.quantidade, 0),
        cent: meus.reduce((s, l) => s + l.quantidade * l.valor_unitario_centavos, 0),
      };
    });
    const totalCent = linhas.reduce((s, l) => s + l.cent, 0);
    const data: ResumoUsuarioRow[] = linhas
      .sort(
        (a, b) =>
          b.cent - a.cent ||
          a.perfil.nome.localeCompare(b.perfil.nome) ||
          a.perfil.username.localeCompare(b.perfil.username),
      )
      .map(({ perfil, qtd, cent }) => ({
        user_id: perfil.id,
        nome: perfil.nome,
        username: perfil.username,
        role: perfil.role,
        ativo: perfil.ativo,
        quantidade: qtd,
        valor: cent / 100,
        total_geral: totalCent / 100,
      }));
    return { data, error: null };
  }

  return {
    register(registry: RpcRegistry) {
      registry.setRpcHandler('resumo_por_usuario', (args) => resumo('resumo_por_usuario', args));
      registry.setRpcHandler('resumo_por_usuario_nomes', (args) =>
        resumo('resumo_por_usuario_nomes', args),
      );
    },
    seed(list: { perfis: Perfil[]; lancamentos: FakeLancamentoEquipe[] }) {
      perfis = list.perfis.map((p) => ({ ...p }));
      lancamentos = list.lancamentos.map((l) => ({ ...l }));
    },
    setGestor(value: boolean) {
      gestor = value;
    },
    get calls(): ReadonlyArray<FakeEquipeCall> {
      return calls;
    },
    reset() {
      perfis = [];
      lancamentos = [];
      gestor = true;
      calls.length = 0;
    },
  };
}
