# CLAUDE.md — Controle de Produção de Entregas

Web app **mobile-first** (PWA instalável) para registrar a produção diária de entregas por categoria e acompanhar os totais em R$ por período. Ele aceita vários usuários, e os dados de cada um ficam isolados.

## Stack (não trocar sem registrar decisão em `docs/decisoes.md`)
| Camada | Tecnologia |
|---|---|
| Front | React 18 + Vite + TypeScript (strict) + Tailwind CSS |
| Roteamento | React Router com `HashRouter` (exigência do GitHub Pages) |
| Dados (cliente) | `@supabase/supabase-js` + TanStack Query |
| Validação | Zod |
| Datas | date-fns com locale `ptBR` |
| PWA | `vite-plugin-pwa` |
| Back | Supabase (Postgres + Auth + RLS + Edge Functions), plano gratuito |
| Hospedagem | GitHub Pages via GitHub Actions |
| Testes | Vitest + Testing Library; SQL de verificação de RLS |

## Estrutura de pastas
```
.claude/agents/   subagents especializados (ver "Agents")
specs/            especificações funcionais — FONTE DA VERDADE do comportamento
tasks/            checklist de tarefas por spec (mesmo número da spec)
docs/             decisões (ADR curtas) e guias manuais (setup Supabase/GitHub)
supabase/
  migrations/     SQL versionado: NNNN_descricao.sql (nunca editar migration já aplicada)
  functions/      Edge Functions (Deno)
  tests/          scripts SQL de verificação (RLS)
src/
  lib/            supabase client, formatadores (moeda/data), helpers de auth
  features/       uma pasta por domínio: auth, categorias, lancamentos, relatorio, admin
    <feature>/    api.ts (queries/mutations), hooks.ts, components/, <Feature>Page.tsx, *.test.ts(x)
  components/ui/  componentes base reutilizáveis (Button, Input, Card, Stepper, BottomNav…)
  routes/         definição de rotas e guards (ProtectedRoute, AdminRoute)
```

## Fluxo de trabalho (spec → task → agent)
1. Leia a **spec** inteira antes de qualquer task dela (`specs/NNN-*.md`).
2. Em `tasks/NNN-*.md`, pegue a próxima task `[ ]` cujas dependências estejam todas `[x]`.
3. Delegue ao **agent** indicado na task (campo `agent:`). Tasks sem dependência mútua podem rodar em paralelo.
4. Ao concluir, marque `[x]`. Se a implementação divergir da spec, **atualize a spec** na mesma mudança e explique o motivo.
5. Antes de marcar uma etapa como concluída, rode `npm run lint && npm test && npm run build`.
6. Um commit por task concluída, mensagem `tipo(escopo): descrição` (ex.: `feat(categorias): CRUD de categorias`).

### Ordem das etapas
| Etapa | Specs (paralelo) |
|---|---|
| 1 | 001 Fundação ‖ 002 Banco e Auth |
| 2 | 003 Categorias ‖ 006 Admin usuários |
| 3 | 004 Lançamentos ‖ 005 Relatório |
| 4 | 007 PWA e Deploy ‖ QA final |

## Agents (`.claude/agents/`)
| Agent | Responsável por | Pode editar |
|---|---|---|
| `db-supabase` | schema, migrations, RLS, RPCs, Edge Functions | `supabase/**`, `docs/**` |
| `frontend-ui` | telas, componentes, hooks, rotas, estilos | `src/**`, `index.html`, `public/**`, configs do Vite/Tailwind/TS |
| `qa-tester` | testes automatizados, verificação de RLS, checklist manual | `src/**/*.test.ts(x)`, `supabase/tests/**`, `docs/qa/**` |
| `devops-deploy` | GitHub Actions, Pages, PWA, keep-alive, setup | `.github/**`, `vite.config.ts` (bloco PWA/base), `public/` (ícones), `docs/**` |

## Convenções
- **Idioma:** UI e mensagens em **pt-BR**. Nomes de tabelas/colunas em pt-BR (`categorias`, `lancamentos`, `valor_unitario`) para casar com o domínio; código TS em inglês, exceto quando espelha o nome do banco.
- **Dinheiro:** `numeric(10,2)` no banco. No front, **nunca** some floats para exibir totais; use os valores que o banco calculou (`valor_total`, RPC). Formate com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, usando o helper `formatBRL` em `src/lib/format.ts`.
- **Datas:** a coluna `data` é `date` (sem fuso). No front, trafegue como string `yyyy-MM-dd`. Nunca use `new Date('yyyy-MM-dd')`, porque ele interpreta em UTC e desloca o dia; use `parseISO`/`format` do date-fns.
- **Preço congelado:** o `lancamentos.valor_unitario` é copiado da categoria no momento do lançamento. Reajustar uma categoria **não** altera o histórico.
- **Segurança:** todo acesso a dados é protegido por RLS (`user_id = auth.uid()`). O front usa só a chave `anon`. A `service_role` existe **apenas** nas Edge Functions. Nunca commitar `.env`.
- **Login por usuário:** `username` → e-mail sintético `${username}@entregas.local` (helper `usernameToEmail` em `src/lib/auth.ts`). O usuário nunca vê esse e-mail.
- **Mobile-first:** projete para 360px primeiro; alvos de toque ≥ 44px; navegação por barra inferior; formulários com `inputMode="numeric"`/`decimal`.
- **Acessibilidade:** labels em todos os inputs, contraste AA e foco visível.
- **Estado de servidor:** só TanStack Query (sem duplicar em estado global). Invalide as queries afetadas após cada mutation.

## Comandos
```bash
npm install
npm run dev          # app local (http://localhost:5173)
npm run lint
npm test             # vitest run
npm run build        # gera dist/
npx supabase db push # aplica migrations no projeto remoto (requer supabase login + link)
npx supabase functions deploy admin-create-user
```

## Variáveis de ambiente
`.env.local` (não versionado; modelo em `.env.example`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No GitHub, as mesmas variáveis ficam como **Repository secrets**, usadas pelo workflow de deploy.

## Limitações conhecidas do plano gratuito
- O Supabase pausa o projeto após cerca de 7 dias sem requisições. O workflow `keep-alive.yml` faz um ping semanal.
- O GitHub Pages exige repositório público no plano Free. Não há segredo no front, então isso é aceitável.
