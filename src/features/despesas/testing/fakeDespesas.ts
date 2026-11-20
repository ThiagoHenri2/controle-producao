/**
 * Despesas em memória para testes (spec 009), no padrão dos outros fakes:
 * - `createFakeCategoriasDespesaTable()`: tabela `categorias_despesa` (23505 no
 *   nome duplicado sem diferenciar maiúsculas; 23503 ao excluir categoria em uso);
 * - `createFakeDespesasTable(categorias, authUid)`: tabela `despesas` com as regras
 *   do banco (data futura, valor ≤ 0, categoria de outro dono/inativa, `criado_por`
 *   forçado para o usuário logado);
 * - `createFakeResumoDespesas(...)`: RPCs `resumo_despesas_*`, calculadas a partir
 *   das linhas atuais da tabela falsa (somas em centavos).
 * Registre com `fakeSupabase.setTableHandler(...)` e `fakeResumo.register(fakeSupabase)`.
 */
import type { Perfil } from '@/features/equipe/api';
import type { ResumoUsuarioRow, Tables } from '@/lib/database.types';
import { hojeISO, toCentavos, toISODate } from '@/lib/format';
import type { RpcHandler, RpcResult } from '@/test/supabaseMock';

type CategoriaDespesa = Tables<'categorias_despesa'>;
type Despesa = Tables<'despesas'>;
type Row = Despesa & { categoria: { nome: string } | null };
type PgError = { code: string; message: string; details: string | null; hint: string | null };
type Result<T> = { data: T; error: PgError | null };

function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
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

/** Operações seguráveis (`hold`) e com falha forçada (`failNext`), como nos outros fakes. */
function createControle() {
  let gate: Promise<void> | null = null;
  let failNext: PgError | null = null;
  return {
    async run<T>(fn: () => Result<T>): Promise<Result<T>> {
      if (gate) await gate;
      if (failNext) {
        const error = failNext;
        failNext = null;
        return { data: null as T, error };
      }
      return fn();
    },
    failNext(code: string, message = 'erro simulado') {
      failNext = pgError(code, message);
    },
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
      gate = null;
      failNext = null;
    },
  };
}

// ---------------------------------------------------------------------------
// categorias_despesa
// ---------------------------------------------------------------------------

export function makeCategoriaDespesa(overrides: Partial<CategoriaDespesa> = {}): CategoriaDespesa {
  return {
    id: `cd-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'user-1',
    nome: 'Combustível',
    ativa: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

export function createFakeCategoriasDespesaTable() {
  let rows: CategoriaDespesa[] = [];
  const emUso = new Map<string, string>();
  const ctl = createControle();
  let seq = 1;
  /** Payloads recebidos em cada `insert`/`update`. */
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  /** Filtros `eq` de cada `select` (para conferir o filtro por `user_id`). */
  const selects: Array<Record<string, unknown>> = [];

  // Índice único (user_id, lower(btrim(nome))) da 0007.
  const conflita = (userId: string, nome: string, ignorarId?: string) =>
    rows.some((r) => r.id !== ignorarId && r.user_id === userId && norm(r.nome) === norm(nome));
  const duplicado = () =>
    pgError('23505', 'duplicate key value violates unique constraint "categorias_despesa_nome_ci"');

  function selectQuery() {
    const filters: Array<(r: CategoriaDespesa) => boolean> = [];
    const eqs: Record<string, unknown> = {};
    selects.push(eqs);
    const query = {
      eq(column: keyof CategoriaDespesa, value: unknown) {
        eqs[column] = value;
        filters.push((r) => r[column] === value);
        return query;
      },
      order() {
        return query;
      },
      ...thenable<CategoriaDespesa[]>(() =>
        ctl.run(() => ({
          data: rows
            .filter((r) => filters.every((f) => f(r)))
            .sort(
              (a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome, 'pt-BR'),
            )
            .map((r) => ({ ...r })),
          error: null,
        })),
      ),
    };
    return query;
  }

  const handler = () => ({
    select: () => selectQuery(),
    insert: (input: Partial<CategoriaDespesa> & { nome: string }) => {
      inserts.push({ ...input });
      return {
        select: () => ({
          single: () =>
            ctl.run<CategoriaDespesa | null>(() => {
              const userId = input.user_id ?? 'user-1';
              if (conflita(userId, input.nome)) return { data: null, error: duplicado() };
              const row = makeCategoriaDespesa({
                ...input,
                user_id: userId,
                id: `cd-${seq++}`,
                ativa: input.ativa ?? true,
              });
              rows.push(row);
              return { data: { ...row }, error: null };
            }),
        }),
      };
    },
    update: (patch: Partial<CategoriaDespesa>) => {
      updates.push({ ...patch });
      return {
        eq: (_column: 'id', id: string) => ({
          select: () => ({
            single: () =>
              ctl.run<CategoriaDespesa | null>(() => {
                const row = rows.find((r) => r.id === id);
                if (!row) return { data: null, error: pgError('PGRST116', 'no rows') };
                if (patch.nome !== undefined && conflita(row.user_id, patch.nome, id)) {
                  return { data: null, error: duplicado() };
                }
                Object.assign(row, patch);
                return { data: { ...row }, error: null };
              }),
          }),
        }),
      };
    },
    delete: () => ({
      eq: (_column: 'id', id: string) =>
        ctl.run<null>(() => {
          const code = emUso.get(id);
          if (code) return { data: null, error: pgError(code, 'violates foreign key constraint') };
          rows = rows.filter((r) => r.id !== id);
          return { data: null, error: null };
        }),
    }),
  });

  return {
    handler,
    inserts,
    updates,
    selects,
    get rows(): readonly CategoriaDespesa[] {
      return rows;
    },
    seed(list: CategoriaDespesa[]) {
      rows = list.map((r) => ({ ...r }));
    },
    /** A categoria tem despesas: excluir devolve 23503 (FK no action) ou `code`. */
    marcarEmUso(id: string, code = '23503') {
      emUso.set(id, code);
    },
    failNext: ctl.failNext,
    hold: ctl.hold,
    reset() {
      rows = [];
      emUso.clear();
      inserts.length = 0;
      updates.length = 0;
      selects.length = 0;
      ctl.reset();
      seq = 1;
    },
  };
}

// ---------------------------------------------------------------------------
// despesas
// ---------------------------------------------------------------------------

export function makeDespesa(overrides: Partial<Despesa> = {}): Despesa {
  const user_id = overrides.user_id ?? 'user-1';
  return {
    id: `desp-${Math.random().toString(36).slice(2, 10)}`,
    user_id,
    criado_por: user_id,
    categoria_despesa_id: 'cd-1',
    data: hojeISO(),
    valor: 10,
    descricao: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function amanhaISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

type DespesaInput = Record<string, unknown> & {
  data?: string;
  categoria_despesa_id?: string;
  valor?: number | null;
  descricao?: string | null;
};

export function createFakeDespesasTable(
  categorias: () => ReadonlyArray<CategoriaDespesa>,
  authUid: () => string = () => 'user-1',
) {
  let rows: Despesa[] = [];
  const ctl = createControle();
  let seq = 1;
  /** Payloads recebidos em cada `insert`/`update` (para conferir o que o front envia). */
  const inserts: DespesaInput[] = [];
  const updates: DespesaInput[] = [];
  /** Filtros `eq` de cada `select` (para conferir o filtro por `user_id`). */
  const selects: Array<Record<string, unknown>> = [];

  const comCategoria = (r: Despesa): Row => {
    const cat = categorias().find((c) => c.id === r.categoria_despesa_id);
    return { ...r, categoria: cat ? { nome: cat.nome } : null };
  };

  /** Checks e trigger de validação da 0007. */
  function validar(
    d: Pick<Despesa, 'data' | 'valor' | 'user_id' | 'categoria_despesa_id'> & {
      descricao: string | null;
    },
  ): PgError | null {
    if (d.valor === null || d.valor === undefined) {
      return pgError('23502', 'null value in column "valor" violates not-null constraint');
    }
    if (d.data > amanhaISO()) {
      return pgError(
        '23514',
        'new row for relation "despesas" violates check constraint "despesas_data_nao_futura"',
      );
    }
    if (!(d.valor > 0) || d.valor > 99_999_999.99) {
      return pgError('23514', 'violates check constraint "despesas_valor_check"');
    }
    if (d.descricao && d.descricao.length > 200) {
      return pgError('23514', 'violates check constraint "despesas_descricao_check"');
    }
    const cat = categorias().find((c) => c.id === d.categoria_despesa_id);
    if (!cat || cat.user_id !== d.user_id) {
      return pgError('23503', 'Categoria de despesa inválida: não encontrada.');
    }
    if (!cat.ativa) {
      return pgError('23514', 'Categoria de despesa inativa: não é possível lançar.');
    }
    return null;
  }

  const handler = () => ({
    select: () => {
      const filters: Array<(r: Despesa) => boolean> = [];
      const eqs: Record<string, unknown> = {};
      selects.push(eqs);
      const query = {
        eq(column: keyof Despesa, value: unknown) {
          eqs[column] = value;
          filters.push((r) => r[column] === value);
          return query;
        },
        order() {
          return query;
        },
        ...thenable<Row[]>(() =>
          ctl.run(() => ({
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
    insert: (input: DespesaInput) => {
      inserts.push({ ...input });
      return {
        select: () => ({
          single: () =>
            ctl.run<Row | null>(() => {
              const n = seq++;
              const row = makeDespesa({
                id: `desp-${n}`,
                user_id: typeof input.user_id === 'string' ? input.user_id : authUid(),
                // Trigger anti-forja: sempre o usuário logado.
                criado_por: authUid(),
                categoria_despesa_id: input.categoria_despesa_id ?? '',
                data: input.data ?? hojeISO(),
                valor: input.valor as number,
                descricao: input.descricao ?? null,
                created_at: `2026-01-01T00:01:${String(n).padStart(2, '0')}Z`,
              });
              const error = validar(row);
              if (error) return { data: null, error };
              rows.push(row);
              return { data: comCategoria(row), error: null };
            }),
        }),
      };
    },
    update: (patch: DespesaInput) => {
      updates.push({ ...patch });
      return {
        eq: (_column: 'id', id: string) => ({
          select: () => ({
            single: () =>
              ctl.run<Row | null>(() => {
                const row = rows.find((r) => r.id === id);
                if (!row) return { data: null, error: pgError('PGRST116', 'no rows') };
                const next = { ...row, ...patch } as Despesa;
                const error = validar(next);
                if (error) return { data: null, error };
                Object.assign(row, next);
                return { data: comCategoria(row), error: null };
              }),
          }),
        }),
      };
    },
    delete: () => ({
      eq: (_column: 'id', id: string) =>
        ctl.run<null>(() => {
          rows = rows.filter((r) => r.id !== id);
          return { data: null, error: null };
        }),
    }),
  });

  return {
    handler,
    inserts,
    updates,
    selects,
    get rows(): readonly Despesa[] {
      return rows;
    },
    seed(list: Despesa[]) {
      rows = list.map((r) => ({ ...r }));
    },
    failNext: ctl.failNext,
    hold: ctl.hold,
    reset() {
      rows = [];
      inserts.length = 0;
      updates.length = 0;
      selects.length = 0;
      ctl.reset();
      seq = 1;
    },
  };
}

// ---------------------------------------------------------------------------
// RPCs resumo_despesas_* (calculadas das linhas atuais)
// ---------------------------------------------------------------------------

type RpcRegistry = { setRpcHandler: (fn: string, handler: RpcHandler) => void };

export type FakeResumoDespesasCall = {
  fn: string;
  de: string;
  ate: string;
  categorias?: string[];
  usuario?: string;
  nomes?: string[];
};

export function createFakeResumoDespesas(
  despesas: () => ReadonlyArray<Despesa>,
  categorias: () => ReadonlyArray<CategoriaDespesa>,
  perfis: () => ReadonlyArray<Perfil> = () => [],
) {
  let eu = 'user-1';
  let gestor = false;
  const calls: FakeResumoDespesasCall[] = [];
  const negado: RpcResult = { data: null, error: { code: '42501', message: 'Acesso negado' } };

  type Filtro = { de: string; ate: string; categorias: string[] | null; usuario: string };

  function filtro(fn: string, args: Record<string, unknown>): Filtro | RpcResult {
    const de = String(args.p_de ?? '');
    const ate = String(args.p_ate ?? '');
    if (!de || !ate || de > ate) {
      return { data: null, error: { code: '22023', message: 'Período inválido.' } };
    }
    const usuario = typeof args.p_usuario === 'string' ? args.p_usuario : null;
    if (usuario && usuario !== eu && !gestor) return negado;
    const cats = Array.isArray(args.p_categorias) ? args.p_categorias.map(String) : null;
    const call: FakeResumoDespesasCall = { fn, de, ate };
    if (cats) call.categorias = cats;
    if (usuario) call.usuario = usuario;
    calls.push(call);
    return { de, ate, categorias: cats, usuario: usuario ?? eu };
  }

  const doFiltro = (f: Filtro) =>
    despesas().filter(
      (d) =>
        d.user_id === f.usuario &&
        d.data >= f.de &&
        d.data <= f.ate &&
        (!f.categorias || f.categorias.includes(d.categoria_despesa_id)),
    );

  function porCategoria(args: Record<string, unknown>): RpcResult {
    const f = filtro('resumo_despesas_por_categoria', args);
    if ('error' in f) return f;
    const map = new Map<string, { qtd: number; cent: number }>();
    for (const d of doFiltro(f)) {
      const acc = map.get(d.categoria_despesa_id) ?? { qtd: 0, cent: 0 };
      acc.qtd += 1;
      acc.cent += toCentavos(d.valor);
      map.set(d.categoria_despesa_id, acc);
    }
    const total = [...map.values()].reduce((s, c) => s + c.cent, 0);
    const data = [...map.entries()]
      .map(([id, c]) => {
        const cat = categorias().find((x) => x.id === id);
        return { id, nome: cat?.nome ?? '?', ativa: cat?.ativa ?? true, ...c };
      })
      .sort((a, b) => b.cent - a.cent || a.nome.localeCompare(b.nome))
      .map((c) => ({
        categoria_id: c.id,
        nome: c.nome,
        ativa: c.ativa,
        quantidade: c.qtd,
        valor: c.cent / 100,
        total_geral: total / 100,
      }));
    return { data, error: null };
  }

  function porDia(args: Record<string, unknown>): RpcResult {
    const f = filtro('resumo_despesas_por_dia', args);
    if ('error' in f) return f;
    const map = new Map<string, { qtd: number; cent: number }>();
    for (const d of doFiltro(f)) {
      const acc = map.get(d.data) ?? { qtd: 0, cent: 0 };
      acc.qtd += 1;
      acc.cent += toCentavos(d.valor);
      map.set(d.data, acc);
    }
    const data = [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([dia, c]) => ({ data: dia, quantidade: c.qtd, valor: c.cent / 100 }));
    return { data, error: null };
  }

  function porUsuario(args: Record<string, unknown>): RpcResult {
    if (!gestor) return negado;
    const de = String(args.p_de ?? '');
    const ate = String(args.p_ate ?? '');
    const nomes = Array.isArray(args.p_nomes) ? args.p_nomes.map((n) => norm(String(n))) : null;
    calls.push(
      nomes
        ? { fn: 'resumo_despesas_por_usuario_nomes', de, ate, nomes }
        : { fn: 'resumo_despesas_por_usuario_nomes', de, ate },
    );
    const nomeCat = (id: string) => categorias().find((c) => c.id === id)?.nome ?? '';
    const linhas = perfis().map((p) => {
      const meus = despesas().filter(
        (d) =>
          d.user_id === p.id &&
          d.data >= de &&
          d.data <= ate &&
          (!nomes || nomes.includes(norm(nomeCat(d.categoria_despesa_id)))),
      );
      return {
        perfil: p,
        qtd: meus.length,
        cent: meus.reduce((s, d) => s + toCentavos(d.valor), 0),
      };
    });
    const total = linhas.reduce((s, l) => s + l.cent, 0);
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
        total_geral: total / 100,
      }));
    return { data, error: null };
  }

  return {
    register(registry: RpcRegistry) {
      registry.setRpcHandler('resumo_despesas_por_categoria', porCategoria);
      registry.setRpcHandler('resumo_despesas_por_dia', porDia);
      registry.setRpcHandler('resumo_despesas_por_usuario_nomes', porUsuario);
    },
    /** Usuário logado (`p_usuario` omitido) e se ele é gestor. */
    setAuth(id: string, isGestor: boolean) {
      eu = id;
      gestor = isGestor;
    },
    get calls(): ReadonlyArray<FakeResumoDespesasCall> {
      return calls;
    },
    reset() {
      eu = 'user-1';
      gestor = false;
      calls.length = 0;
    },
  };
}
