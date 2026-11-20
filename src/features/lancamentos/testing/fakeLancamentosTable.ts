/**
 * Tabela `lancamentos` em memória para testes (registrada no `fakeSupabase` via
 * `setTableHandler('lancamentos', ...)`). Simula as regras do banco que o front trata:
 * - trigger `lancamentos_preco_snapshot`: copia o preço da categoria; categoria
 *   inexistente → 23503, inativa → 23514;
 * - `check (data <= current_date + 1)` (`lancamentos_data_nao_futura`) → 23514;
 * - insert em lote atômico (tudo ou nada); `valor_total` calculado pelo banco.
 */
import type { Tables } from '@/lib/database.types';
import { hojeISO, toISODate } from '@/lib/format';

type Lancamento = Tables<'lancamentos'>;
type Categoria = Tables<'categorias'>;
type Row = Lancamento & { categoria: { nome: string } | null };
type PgError = { code: string; message: string; details: string | null; hint: string | null };
type Result<T> = { data: T; error: PgError | null };
type InsertInput = Record<string, unknown> & {
  data: string;
  categoria_id: string;
  quantidade: number;
};

function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
}

function valorTotal(quantidade: number, valorUnitario: number): number {
  return Math.round(quantidade * Math.round(valorUnitario * 100)) / 100;
}

function amanhaISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

export function makeLancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  const quantidade = overrides.quantidade ?? 1;
  const valor_unitario = overrides.valor_unitario ?? 2.5;
  return {
    id: `lan-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'user-1',
    categoria_id: 'cat-1',
    data: hojeISO(),
    observacao: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
    quantidade,
    valor_unitario,
    valor_total: valorTotal(quantidade, valor_unitario),
  };
}

function thenable<T>(exec: () => Promise<Result<T>>) {
  return {
    then<R1 = Result<T>, R2 = never>(
      onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): Promise<R1 | R2> {
      return exec().then(onfulfilled, onrejected);
    },
  };
}

export function createFakeLancamentosTable(categorias: () => ReadonlyArray<Categoria>) {
  let rows: Lancamento[] = [];
  let gate: Promise<void> | null = null;
  let failNext: PgError | null = null;
  let seq = 1;
  /** Payloads recebidos em cada `insert` (para conferir o que o front envia). */
  const inserts: InsertInput[][] = [];

  async function run<T>(fn: () => Result<T>): Promise<Result<T>> {
    if (gate) await gate;
    if (failNext) {
      const error = failNext;
      failNext = null;
      return { data: null as T, error };
    }
    return fn();
  }

  const comCategoria = (r: Lancamento): Row => {
    const cat = categorias().find((c) => c.id === r.categoria_id);
    return { ...r, categoria: cat ? { nome: cat.nome } : null };
  };

  const handler = () => ({
    select: () => {
      const filters: Array<(r: Lancamento) => boolean> = [];
      const query = {
        eq(column: keyof Lancamento, value: unknown) {
          filters.push((r) => r[column] === value);
          return query;
        },
        order() {
          return query;
        },
        ...thenable<Row[]>(() =>
          run(() => ({
            data: rows
              .filter((r) => filters.every((f) => f(r)))
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map(comCategoria),
            error: null,
          })),
        ),
      };
      return query;
    },
    insert: (input: InsertInput[]) => {
      inserts.push(input.map((i) => ({ ...i })));
      return {
        select: () =>
          thenable<Row[] | null>(() =>
            run(() => {
              const novos: Lancamento[] = [];
              for (const item of input) {
                if (item.data > amanhaISO()) {
                  return {
                    data: null,
                    error: pgError(
                      '23514',
                      'new row for relation "lancamentos" violates check constraint "lancamentos_data_nao_futura"',
                    ),
                  };
                }
                const cat = categorias().find((c) => c.id === item.categoria_id);
                if (!cat) {
                  return {
                    data: null,
                    error: pgError('23503', 'Categoria inválida: não encontrada.'),
                  };
                }
                if (!cat.ativa) {
                  return {
                    data: null,
                    error: pgError('23514', 'Categoria inativa: não é possível lançar.'),
                  };
                }
                const n = seq++;
                novos.push(
                  makeLancamento({
                    id: `lan-${n}`,
                    categoria_id: item.categoria_id,
                    data: item.data,
                    quantidade: item.quantidade,
                    valor_unitario: cat.valor_unitario,
                    created_at: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
                  }),
                );
              }
              rows.push(...novos);
              return { data: novos.map(comCategoria), error: null };
            }),
          ),
      };
    },
    update: (patch: Partial<Pick<Lancamento, 'quantidade' | 'observacao'>>) => ({
      eq: (_column: 'id', id: string) => ({
        select: () => ({
          single: () =>
            run<Row | null>(() => {
              const row = rows.find((r) => r.id === id);
              if (!row) return { data: null, error: pgError('PGRST116', 'no rows') };
              Object.assign(row, patch);
              row.valor_total = valorTotal(row.quantidade, row.valor_unitario);
              return { data: comCategoria(row), error: null };
            }),
        }),
      }),
    }),
    delete: () => ({
      eq: (_column: 'id', id: string) =>
        run<null>(() => {
          rows = rows.filter((r) => r.id !== id);
          return { data: null, error: null };
        }),
    }),
  });

  return {
    handler,
    inserts,
    get rows(): readonly Lancamento[] {
      return rows;
    },
    seed(list: Lancamento[]) {
      rows = list.map((r) => ({ ...r }));
    },
    /** A próxima operação falha com este erro. */
    failNext(code: string, message = 'erro simulado') {
      failNext = pgError(code, message);
    },
    /** Segura todas as operações até chamar a função retornada. */
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
      rows = [];
      gate = null;
      failNext = null;
      seq = 1;
      inserts.length = 0;
    },
  };
}
