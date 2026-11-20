/**
 * Tabela `categorias` em memória para testes (registrada no `fakeSupabase` via
 * `setTableHandler('categorias', ...)`). Simula as regras do banco que o front trata:
 * - `unique(user_id, nome)` diferenciando maiúsculas → erro 23505 (por dono);
 * - FK `restrict` de lançamentos → erro 23503 ao excluir categoria "em uso".
 */
import type { Tables } from '@/lib/database.types';

type Categoria = Tables<'categorias'>;
type PgError = { code: string; message: string; details: string | null; hint: string | null };
type Result<T> = { data: T; error: PgError | null };
type Order = { column: keyof Categoria; ascending: boolean };

function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
}

export function makeCategoria(overrides: Partial<Categoria> = {}): Categoria {
  return {
    id: `cat-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'user-1',
    nome: 'Sanduíche',
    valor_unitario: 2.5,
    ativa: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function createFakeCategoriasTable() {
  let rows: Categoria[] = [];
  const emUso = new Set<string>();
  let gate: Promise<void> | null = null;
  let failNext: PgError | null = null;
  let seq = 1;

  async function run<T>(fn: () => Result<T>): Promise<Result<T>> {
    if (gate) await gate;
    if (failNext) {
      const error = failNext;
      failNext = null;
      return { data: null as T, error };
    }
    return fn();
  }

  /** Payloads recebidos em cada `insert` (para conferir o `user_id` enviado). */
  const inserts: Array<Record<string, unknown>> = [];
  /** Filtros `eq` de cada `select` (para conferir o filtro por `user_id`). */
  const selects: Array<Record<string, unknown>> = [];

  const conflita = (userId: string, nome: string, ignorarId?: string) =>
    rows.some((r) => r.id !== ignorarId && r.user_id === userId && r.nome === nome);

  function selectQuery() {
    const filters: Array<(r: Categoria) => boolean> = [];
    const eqs: Record<string, unknown> = {};
    selects.push(eqs);
    const orders: Order[] = [];
    const exec = () =>
      run<Categoria[]>(() => {
        const list = rows.filter((r) => filters.every((f) => f(r)));
        list.sort((a, b) => {
          for (const { column, ascending } of orders) {
            const va = a[column];
            const vb = b[column];
            if (va === vb) continue;
            const cmp =
              typeof va === 'string' && typeof vb === 'string'
                ? va.localeCompare(vb, 'pt-BR')
                : Number(va) - Number(vb);
            return ascending ? cmp : -cmp;
          }
          return 0;
        });
        return { data: list.map((r) => ({ ...r })), error: null };
      });
    const query = {
      eq(column: keyof Categoria, value: unknown) {
        eqs[column] = value;
        filters.push((r) => r[column] === value);
        return query;
      },
      order(column: keyof Categoria, opts: { ascending?: boolean } = {}) {
        orders.push({ column, ascending: opts.ascending ?? true });
        return query;
      },
      then<R1 = Result<Categoria[]>, R2 = never>(
        onfulfilled?: ((value: Result<Categoria[]>) => R1 | PromiseLike<R1>) | null,
        onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
      ): Promise<R1 | R2> {
        return exec().then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  const handler = () => ({
    select: () => selectQuery(),
    insert: (input: Partial<Categoria> & { nome: string; valor_unitario: number }) => {
      inserts.push({ ...input });
      return {
        select: () => ({
          single: () =>
            run<Categoria | null>(() => {
              if (conflita(input.user_id ?? 'user-1', input.nome)) {
                return {
                  data: null,
                  error: pgError('23505', 'duplicate key value violates unique constraint'),
                };
              }
              const row = makeCategoria({
                ...input,
                id: `cat-${seq++}`,
                ativa: input.ativa ?? true,
              });
              rows.push(row);
              return { data: { ...row }, error: null };
            }),
        }),
      };
    },
    update: (patch: Partial<Categoria>) => ({
      eq: (_column: 'id', id: string) => ({
        select: () => ({
          single: () =>
            run<Categoria | null>(() => {
              const row = rows.find((r) => r.id === id);
              if (!row) return { data: null, error: pgError('PGRST116', 'no rows') };
              if (patch.nome !== undefined && conflita(row.user_id, patch.nome, id)) {
                return {
                  data: null,
                  error: pgError('23505', 'duplicate key value violates unique constraint'),
                };
              }
              Object.assign(row, patch);
              return { data: { ...row }, error: null };
            }),
        }),
      }),
    }),
    delete: () => ({
      eq: (_column: 'id', id: string) =>
        run<null>(() => {
          if (emUso.has(id)) {
            return { data: null, error: pgError('23503', 'violates foreign key constraint') };
          }
          rows = rows.filter((r) => r.id !== id);
          return { data: null, error: null };
        }),
    }),
  });

  return {
    handler,
    inserts,
    selects,
    get rows(): readonly Categoria[] {
      return rows;
    },
    seed(list: Categoria[]) {
      rows = list.map((r) => ({ ...r }));
    },
    /** Marca a categoria como tendo lançamentos (exclusão vira 23503). */
    marcarEmUso(id: string) {
      emUso.add(id);
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
      emUso.clear();
      inserts.length = 0;
      selects.length = 0;
      gate = null;
      failNext = null;
      seq = 1;
    },
  };
}
