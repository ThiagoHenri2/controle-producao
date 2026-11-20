# Spec 001 — Fundação do projeto

**Etapa:** 1 · **Agents:** frontend-ui (principal), qa-tester · **Depende de:** —

## Objetivo
Criar o esqueleto do app web: build, lint, testes, design system mínimo, layout mobile-first com navegação inferior e cliente Supabase configurado, para que todas as features seguintes só "encaixem" telas.

## Escopo
- Projeto Vite + React 18 + TypeScript strict.
- Tailwind CSS com design tokens (cores, raio, espaçamentos).
- ESLint (flat config) + Prettier.
- Vitest + Testing Library + jsdom, com setup em `src/test/setup.ts`.
- React Router (`HashRouter`) com rotas placeholder: `/login`, `/` (Lançar), `/relatorio`, `/categorias`, `/admin/usuarios`.
- TanStack Query (`QueryClientProvider`) com um `queryClient` padrão (`staleTime` 30s, `retry` 1).
- `src/lib/supabase.ts`: cliente único que lê `import.meta.env.VITE_SUPABASE_*` e lança um erro claro se as variáveis faltarem.
- `src/lib/format.ts`: `formatBRL(valor: number | string)`, `formatData(yyyyMMdd)` → `dd/MM/yyyy`, `rotuloData(yyyyMMdd)` → "Hoje"/"Ontem"/`dd/MM`, `hojeISO()` → `yyyy-MM-dd` no fuso local, `toCentavos`/`fromCentavos`.
- Componentes base em `src/components/ui/`: `Button` (variantes primary/secondary/danger/ghost; loading), `Input` (label + erro), `Card`, `Stepper` (−/+ com input numérico), `BottomNav`, `PageHeader`, `EmptyState`, `Skeleton`, `Toast` (provider + hook `useToast`), `ConfirmDialog`.
- `AppLayout`: header compacto com título da página + conteúdo + `BottomNav` fixa.

## Design tokens (Tailwind)
| Token | Valor sugerido | Uso |
|---|---|---|
| `primary` | laranja `#EA580C` (orange-600) | ações principais (tema "lanche") |
| `primary-foreground` | branco | texto em botões primários |
| `surface` | `#FFFFFF` / fundo `#F8FAFC` | cards / página |
| `success` / `danger` | green-600 / red-600 | toasts, excluir |
| raio | `rounded-xl` cards, `rounded-lg` inputs | |
| fonte | system-ui; números com `tabular-nums` | alinhar valores |

## Wireframe — layout base (360px)
```
┌──────────────────────────────┐
│ Lançar              [sair ⎋] │  ← PageHeader
├──────────────────────────────┤
│                              │
│        (conteúdo)            │
│                              │
├──────────────────────────────┤
│  ✚ Lançar  📊 Relatório  🏷 Categ. │  ← BottomNav fixa (h-16)
└──────────────────────────────┘
```

## Regras
- Nenhuma página deve ter scroll horizontal em 360px.
- `BottomNav` destaca a rota ativa e respeita `env(safe-area-inset-bottom)`.
- `index.html` com `lang="pt-BR"`, `meta viewport` com `viewport-fit=cover` e `theme-color`.

## Critérios de aceite
- [ ] `npm run dev`, `npm run lint`, `npm test` e `npm run build` funcionam sem erros.
- [ ] Navegar entre as 4 rotas pela `BottomNav` funciona em 360px sem scroll horizontal.
- [ ] `formatBRL(225)` → `"R$ 225,00"`; `formatBRL("2.5")` → `"R$ 2,50"` (testado).
- [ ] `hojeISO()` retorna a data local, não UTC (teste com o relógio fixado às 23:30 em America/Sao_Paulo).
- [ ] Sem `VITE_SUPABASE_URL`, o app mostra um erro de configuração legível em vez de uma tela branca.
