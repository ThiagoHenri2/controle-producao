/**
 * RPCs `resumo_por_categoria` e `resumo_por_dia` em memória, para testes.
 * Registre no `fakeSupabase` com `fakeResumo.register(fakeSupabase)`.
 *
 * Soma em centavos inteiros e devolve `numeric` como number (como o PostgREST),
 * com a mesma ordenação e a mesma validação de período (erro 22023) da migration 0003.
 * Aceita `p_categorias` (migration 0005): omitido/null = todas; array = só essas
 * (o `total_geral` e o resumo por dia também ficam filtrados).
 * Aceita `p_usuario` (migration 0006): omitido = o usuário logado (`eu`, padrão
 * 'user-1'); outro id exige gestor (`setGestor(true)`), senão 42501.
 */
import { differenceInCalendarDays } from 'date-fns';
import { parseISODate } from '@/lib/format';
import type { RpcHandler, RpcResult } from '@/test/supabaseMock';
import type { ResumoCategoria, ResumoDia } from '../api';

export type FakeLancamento = {
  data: string;
  categoria_id: string;
  nome: string;
  ativa?: boolean;
  quantidade: number;
  /** Preço congelado no lançamento, em centavos. */
  valor_unitario_centavos: number;
  /** Dono do lançamento (padrão: o usuário logado). */
  user_id?: string;
};

type Args = { p_de?: unknown; p_ate?: unknown; p_categorias?: unknown; p_usuario?: unknown };

/** Chamada válida recebida. `categorias` só aparece quando `p_categorias` veio como array. */
export type FakeResumoCall = {
  fn: string;
  de: string;
  ate: string;
  categorias?: string[];
  /** Só aparece quando `p_usuario` foi enviado. */
  usuario?: string;
};

type Filtro = { de: string; ate: string; categorias: string[] | null; usuario: string | null };
type RpcRegistry = { setRpcHandler: (fn: string, handler: RpcHandler) => void };

const pgError = (code: string, message: string) => ({ code, message });

export function createFakeResumo() {
  let lancamentos: FakeLancamento[] = [];
  let gate: Promise<void> | null = null;
  let failNext: { code: string; message: string } | null = null;
  let eu = 'user-1';
  let gestor = false;
  const calls: FakeResumoCall[] = [];

  function validar(args: Args): Filtro | RpcResult {
    const de = typeof args.p_de === 'string' ? args.p_de : '';
    const ate = typeof args.p_ate === 'string' ? args.p_ate : '';
    if (!de || !ate) return { data: null, error: pgError('22023', 'Período inválido.') };
    if (de > ate) {
      return {
        data: null,
        error: pgError(
          '22023',
          'Período inválido: a data inicial deve ser menor ou igual à data final.',
        ),
      };
    }
    if (differenceInCalendarDays(parseISODate(ate), parseISODate(de)) > 366) {
      return {
        data: null,
        error: pgError('22023', 'Período inválido: o intervalo máximo é de 366 dias.'),
      };
    }
    const usuario = typeof args.p_usuario === 'string' ? args.p_usuario : null;
    if (usuario && usuario !== eu && !gestor) {
      return { data: null, error: pgError('42501', 'Acesso negado') };
    }
    const cats = args.p_categorias;
    if (cats === undefined || cats === null) return { de, ate, categorias: null, usuario };
    if (!Array.isArray(cats) || !cats.every((c): c is string => typeof c === 'string')) {
      return { data: null, error: pgError('22P02', 'invalid input syntax for type uuid') };
    }
    return { de, ate, categorias: [...cats], usuario };
  }

  async function run(fn: string, args: Args, compute: (filtro: Filtro) => unknown) {
    if (gate) await gate;
    if (failNext) {
      const error = failNext;
      failNext = null;
      return { data: null, error };
    }
    const v = validar(args);
    if ('error' in v) return v;
    const call: FakeResumoCall = { fn, de: v.de, ate: v.ate };
    if (v.categorias) call.categorias = v.categorias;
    if (v.usuario) call.usuario = v.usuario;
    calls.push(call);
    return { data: compute(v), error: null };
  }

  const filtrados = ({ de, ate, categorias, usuario }: Filtro) =>
    lancamentos.filter(
      (l) =>
        (l.user_id ?? eu) === (usuario ?? eu) &&
        l.data >= de &&
        l.data <= ate &&
        (!categorias || categorias.includes(l.categoria_id)),
    );

  function porCategoria(filtro: Filtro): ResumoCategoria[] {
    const map = new Map<string, { nome: string; ativa: boolean; qtd: number; cent: number }>();
    for (const l of filtrados(filtro)) {
      const acc = map.get(l.categoria_id) ?? {
        nome: l.nome,
        ativa: l.ativa ?? true,
        qtd: 0,
        cent: 0,
      };
      acc.qtd += l.quantidade;
      acc.cent += l.quantidade * l.valor_unitario_centavos;
      map.set(l.categoria_id, acc);
    }
    const totalCent = [...map.values()].reduce((s, c) => s + c.cent, 0);
    return [...map.entries()]
      .sort(([, a], [, b]) => b.cent - a.cent || a.nome.localeCompare(b.nome))
      .map(([id, c]) => ({
        categoria_id: id,
        nome: c.nome,
        ativa: c.ativa,
        quantidade: c.qtd,
        valor: c.cent / 100,
        total_geral: totalCent / 100,
      }));
  }

  function porDia(filtro: Filtro): ResumoDia[] {
    const map = new Map<string, { qtd: number; cent: number }>();
    for (const l of filtrados(filtro)) {
      const acc = map.get(l.data) ?? { qtd: 0, cent: 0 };
      acc.qtd += l.quantidade;
      acc.cent += l.quantidade * l.valor_unitario_centavos;
      map.set(l.data, acc);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([data, d]) => ({ data, quantidade: d.qtd, valor: d.cent / 100 }));
  }

  return {
    register(registry: RpcRegistry) {
      registry.setRpcHandler('resumo_por_categoria', (args) =>
        run('resumo_por_categoria', args, porCategoria),
      );
      registry.setRpcHandler('resumo_por_dia', (args) => run('resumo_por_dia', args, porDia));
    },
    seed(list: FakeLancamento[]) {
      lancamentos = list.map((l) => ({ ...l }));
    },
    /** Chamadas válidas recebidas (para conferir o período enviado). */
    get calls(): ReadonlyArray<FakeResumoCall> {
      return calls;
    },
    /** Usuário logado (`p_usuario` omitido) e se ele é gestor. */
    setAuth(id: string, isGestor: boolean) {
      eu = id;
      gestor = isGestor;
    },
    /** A próxima chamada falha com este erro. */
    failNext(code: string, message = 'erro simulado') {
      failNext = pgError(code, message);
    },
    /** Segura as chamadas até chamar a função retornada. */
    hold(): () => void {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null;
          resolve();
        };
      });
      return release;
    },
    reset() {
      lancamentos = [];
      gate = null;
      failNext = null;
      eu = 'user-1';
      gestor = false;
      calls.length = 0;
    },
  };
}
