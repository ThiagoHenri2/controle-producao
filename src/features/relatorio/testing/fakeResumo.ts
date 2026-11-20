/**
 * RPCs `resumo_por_categoria` e `resumo_por_dia` em memória, para testes.
 * Registre no `fakeSupabase` com `fakeResumo.register(fakeSupabase)`.
 *
 * Soma em centavos inteiros e devolve `numeric` como number (como o PostgREST),
 * com a mesma ordenação e a mesma validação de período (erro 22023) da migration 0003.
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
};

type Args = { p_de?: unknown; p_ate?: unknown };
type RpcRegistry = { setRpcHandler: (fn: string, handler: RpcHandler) => void };

const pgError = (code: string, message: string) => ({ code, message });

export function createFakeResumo() {
  let lancamentos: FakeLancamento[] = [];
  let gate: Promise<void> | null = null;
  let failNext: { code: string; message: string } | null = null;
  const calls: Array<{ fn: string; de: string; ate: string }> = [];

  function validar(args: Args): { de: string; ate: string } | RpcResult {
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
    return { de, ate };
  }

  async function run(fn: string, args: Args, compute: (de: string, ate: string) => unknown) {
    if (gate) await gate;
    if (failNext) {
      const error = failNext;
      failNext = null;
      return { data: null, error };
    }
    const v = validar(args);
    if ('error' in v) return v;
    calls.push({ fn, ...v });
    return { data: compute(v.de, v.ate), error: null };
  }

  const noPeriodo = (de: string, ate: string) =>
    lancamentos.filter((l) => l.data >= de && l.data <= ate);

  function porCategoria(de: string, ate: string): ResumoCategoria[] {
    const map = new Map<string, { nome: string; ativa: boolean; qtd: number; cent: number }>();
    for (const l of noPeriodo(de, ate)) {
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

  function porDia(de: string, ate: string): ResumoDia[] {
    const map = new Map<string, { qtd: number; cent: number }>();
    for (const l of noPeriodo(de, ate)) {
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
    get calls(): ReadonlyArray<{ fn: string; de: string; ate: string }> {
      return calls;
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
      calls.length = 0;
    },
  };
}
