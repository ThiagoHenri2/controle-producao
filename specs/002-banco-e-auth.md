# Spec 002 — Banco de dados e autenticação

**Etapa:** 1 · **Agents:** db-supabase (schema/RLS), frontend-ui (login/guards), qa-tester · **Depende de:** 001 (só a parte de front)

## Objetivo
Criar todo o schema do banco com isolamento por usuário (RLS) e o fluxo de login por **usuário + senha**, com rotas protegidas.

## Histórias
- Como usuário, entro com meu **usuário** e **senha** e continuo logado ao reabrir o app.
- Como usuário, saio da conta pelo header.
- Como usuário desativado, não consigo usar o app, mesmo com a senha correta.
- Ninguém consegue criar conta sozinho; só o admin cria (ver spec 006).

## Modelo de dados (migration `0001_schema_inicial.sql`)
```sql
profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  nome text not null,
  role text not null default 'user' check (role in ('admin','user')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
)

categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  valor_unitario numeric(10,2) not null check (valor_unitario >= 0),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome)
)

lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  categoria_id uuid not null references categorias on delete restrict,
  data date not null,
  quantidade integer not null check (quantidade > 0),
  valor_unitario numeric(10,2) not null check (valor_unitario >= 0),
  valor_total numeric(12,2) generated always as (quantidade * valor_unitario) stored,
  observacao text check (length(observacao) <= 200),
  created_at timestamptz not null default now()
)
index lancamentos (user_id, data)
```

### Triggers e funções
- `set_updated_at()` em `categorias` (before update).
- `lancamentos_preco_snapshot()` (before insert **e** before update of `categoria_id, user_id`): se `valor_unitario` vier nulo no insert, copia de `categorias.valor_unitario`. Também valida que a categoria pertence ao mesmo `user_id` e está `ativa`. No update ele só revalida quando a categoria ou o usuário mudam, e nunca recopia o preço. Isso impede repontar um lançamento para a categoria de outro usuário (a FK sozinha não impede). Erros: `23503` "Categoria inválida…" e `23514` "Categoria inativa…".
- `is_admin()`: `security definer`, retorna `exists(select 1 from profiles where id = auth.uid() and role = 'admin' and ativo)`.
- `is_ativo()`: `security definer`, retorna se o perfil do `auth.uid()` está ativo.

### Políticas RLS
| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| profiles | `id = auth.uid() or is_admin()` | — (só Edge Function) | — (só Edge Function) | — |
| categorias | `user_id = auth.uid() and is_ativo()` | idem (with check) | idem | idem |
| lancamentos | `user_id = auth.uid() and is_ativo()` | idem (with check) | idem | idem |

O admin **não** enxerga categorias nem lançamentos de outros usuários.

## Login (front)
- `src/lib/auth.ts`: `usernameToEmail(u) = \`${u.trim().toLowerCase()}@entregas.local\``.
- `src/features/auth/`: `AuthProvider` (session via `onAuthStateChange`, carrega o `profile`), `useAuth()` → `{ session, profile, isAdmin, signIn, signOut, loading }`.
- `signIn` chama `supabase.auth.signInWithPassword`. Em seguida, se `profile.ativo = false`, faz signOut e mostra "Usuário desativado. Fale com o administrador."
- Erro de credencial → "Usuário ou senha inválidos." (nunca diga qual dos dois).
- `ProtectedRoute` redireciona para `/login`; `AdminRoute` redireciona para `/` se não for admin.
- Sessão persistida (padrão do supabase-js, em localStorage).

## Wireframe — Login
```
┌──────────────────────────────┐
│          🥪 Entregas          │
│   Controle de produção       │
│                              │
│ Usuário                      │
│ [ joao                     ] │
│ Senha                        │
│ [ ••••••              👁 ]   │
│                              │
│ [         Entrar           ] │
└──────────────────────────────┘
```

## Setup manual (documentar em `docs/setup.md`)
1. Criar o projeto no Supabase (região São Paulo, `sa-east-1`).
2. Authentication → Providers → Email: **desativar "Allow new users to sign up"** e **desativar "Confirm email"**.
3. Aplicar as migrations.
4. Criar o primeiro admin: em Authentication → Users → "Add user", com e-mail `admin@entregas.local` + senha e "Auto confirm" marcado; depois rodar `supabase/seed_admin.sql` (insere em `profiles` com `role='admin'`).

## Critérios de aceite
- [ ] As migrations aplicam do zero sem erro.
- [ ] `supabase/tests/rls_check.sql` prova que o usuário A não vê nem altera categorias e lançamentos de B.
- [ ] Inserir um lançamento sem `valor_unitario` copia o preço da categoria; inserir com a categoria de outro usuário falha.
- [ ] Login com usuário e senha corretos leva a `/`; credencial errada mostra a mensagem genérica.
- [ ] Usuário com `ativo=false` não consegue entrar.
- [ ] Recarregar a página mantém a sessão; "Sair" volta para `/login`.
- [ ] Acessar `/#/admin/usuarios` sendo user comum redireciona para `/`.
