# Spec 009 — Lançamento de despesas

**Etapa:** 6 (melhoria) · **Agents:** db-supabase, frontend-ui, qa-tester · **Depende de:** 008 (papel gestor e usuário alvo)

## Objetivo
Registrar **despesas** (ex.: combustível, manutenção) com **valor livre** em cada lançamento, e permitir que os relatórios mostrem **Receitas**, **Despesas** ou **Ambos** (com saldo).

## Decisões (confirmadas pelo usuário em 20/11/2026)
- **Navegação:** a tela **Lançar** ganha abas no topo, `[Entregas | Despesas]`. A tela **Categorias** ganha as mesmas abas. A BottomNav não muda.
- **Categoria de despesa:** tem só nome e ativa/inativa, **sem valor fixo**.
- **Lançamento de despesa:** data (mesmo seletor e mesmas regras de Lançar: padrão hoje, sem futuro), categoria de despesa, **valor digitado na hora** (R$ > 0) e descrição opcional.
- **Relatório:** seletor `Receitas | Despesas | Ambos`, com padrão **Receitas** (o comportamento de hoje). Em **Ambos**, o card mostra Receitas, Despesas e o **Saldo = receitas − despesas** em destaque.
- **Equipe:** mesmo seletor. Em **Ambos**, cada entregador mostra receitas, despesas e saldo, e há o total de todos. O padrão é Receitas.
- **Dono e permissões:** as despesas são **por usuário**, como as receitas. O **gestor** (gerente/admin) pode ver, lançar, editar e excluir despesas e categorias de despesa de qualquer usuário, usando o mesmo seletor "Lançando para".
- **Auditoria:** cada despesa grava `criado_por`, com o selo "por <nome>", igual aos lançamentos.

## Banco (migration `0007_despesas.sql`)
```
categorias_despesa (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  ativa boolean not null default true,
  created_at, updated_at timestamptz
)
unique index (user_id, lower(btrim(nome)))

despesas (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  categoria_despesa_id uuid not null references categorias_despesa,  -- on delete no action (23503; ver decisoes #9)
  data date not null check (data <= current_date + 1),
  valor numeric(10,2) not null check (valor > 0 and valor <= 99999999.99),
  descricao text check (length(descricao) <= 200),
  criado_por uuid null default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
)
index (user_id, data), index (categoria_despesa_id), index (criado_por)
```
- Os triggers seguem os de `lancamentos`:
  - `set_updated_at` em `categorias_despesa`;
  - validação de que a categoria pertence ao mesmo `user_id` e está ativa (no insert e quando a categoria ou o usuário mudam), com os erros 23503 e 23514;
  - anti-forja de `criado_por` (reutilizar a função da 0006, se for genérica).
- **RLS** igual à da 0006: `is_ativo() and (user_id = auth.uid() or is_gestor())`, nas 4 operações das duas tabelas. Grants: authenticated com CRUD; anon sem nada.
- **RPCs novas.** Todas validam o período (22023), são security invoker e filtram explicitamente por `coalesce(p_usuario, auth.uid())`, com checagem de gestor (42501):
  ```
  resumo_despesas_por_categoria(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
    returns table (categoria_id uuid, nome text, ativa boolean, quantidade bigint, valor numeric, total_geral numeric)
    -- quantidade = nº de lançamentos de despesa
  resumo_despesas_por_dia(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
    returns table (data date, quantidade bigint, valor numeric)
  resumo_despesas_por_usuario_nomes(p_de date, p_ate date, p_nomes text[] default null)
    returns table (user_id uuid, nome text, username text, role text, ativo boolean, quantidade bigint, valor numeric, total_geral numeric)
    -- só gestor; inclui todos os perfis com 0; mesmo formato de resumo_por_usuario_nomes
  ```
- `autores(p_ids)` passa a considerar também `despesas.criado_por`.
- O `rls_check.sql` ganha os cenários: isolamento, gestor, anti-forja, valor ≤ 0 rejeitado, data futura rejeitada, totais por categoria/dia/usuário, filtro por nomes e 42501.

## Front
- **Lançar › aba Despesas:**
  - o mesmo `DateSelector`, com a faixa "Lançando para <data>" e a faixa do gestor;
  - o formulário tem um select (ou lista de chips) com as categorias de despesa ativas do alvo, o Valor em R$ (`inputMode=decimal`, aceita "12,50"/"12.50", reaproveitando o parser BRL de categorias), uma Descrição opcional e o botão **Adicionar despesa**, fixo acima da BottomNav;
  - lista "Despesas em <data>" com o total do dia, editar valor/descrição/categoria num BottomSheet e excluir com confirmação;
  - o selo "por <nome>" aparece quando `criado_por` ≠ `user_id`;
  - sem categorias de despesa ativas: EmptyState com o link "Cadastrar categorias de despesa", que leva a Categorias › Despesas.
- **Abas:** um componente `Tabs` acessível (`role=tablist`), estado na URL `?aba=entregas|despesas` (padrão entregas), reutilizado em Lançar e Categorias.
- **Categorias › aba Despesas:** CRUD com nome e ativa (sem valor). Excluir uma categoria com despesas oferece "Desativar" (FK 23503). Duplicado sem diferenciar maiúsculas, com 23505.
- **Relatório:**
  - seletor segmentado `Receitas | Despesas | Ambos` abaixo do período, na URL como `?tipo=receitas|despesas|ambos` (padrão receitas);
  - **Receitas:** como hoje;
  - **Despesas:** card "Total de despesas" com o nº de lançamentos, lista por categoria de despesa e lista por dia;
  - **Ambos:**
    - card com Receitas (verde), Despesas (vermelho) e **Saldo** em destaque, negativo em vermelho;
    - seção "Entregas" (por categoria) e seção "Despesas" (por categoria);
    - "Por dia" mostra receitas, despesas e saldo de cada dia (merge por data no front, somando em centavos).
  - Filtro de categorias:
    - a checklist mostra as seções Entregas e Despesas conforme o tipo;
    - URL: `cats` para receitas, `dcats` para despesas;
    - o texto do botão reflete os dois filtros.
- **Equipe:**
  - o mesmo seletor `tipo`;
  - **Despesas** usa `resumo_despesas_por_usuario_nomes`;
  - **Ambos** faz o merge por `user_id`, mostrando receitas, despesas e saldo por pessoa, e os totais;
  - o filtro por nome tem as seções Entregas e Despesas (`nomes` e `dnomes`);
  - a ordenação segue o valor do tipo selecionado (saldo em Ambos).
- O dinheiro é sempre formatado com `formatBRL`; somas no front são feitas em centavos.

## Critérios de aceite
- [ ] Criar a categoria de despesa "Combustível" sem valor e lançar R$ 35,90 hoje; ela aparece na aba Despesas com o total do dia de R$ 35,90.
- [ ] Valor 0, negativo ou vazio é bloqueado; data futura é bloqueada.
- [ ] Relatório do mês com receitas R$ 225,00 e despesas R$ 35,90:
  - Receitas mostra R$ 225,00;
  - Despesas mostra R$ 35,90;
  - Ambos mostra Saldo **R$ 189,10**.
- [ ] Em "Ambos", a lista por dia mostra receitas, despesas e saldo do dia.
- [ ] O filtro de despesas (desmarcar "Combustível") zera as despesas e o saldo volta a R$ 225,00.
- [ ] O gestor lança uma despesa para o João; o João a vê com o selo "por <gestor>".
- [ ] O entregador não vê as despesas de outros.
- [ ] Equipe em "Ambos": João receitas R$ 225,00, despesas R$ 35,90, saldo R$ 189,10; o total de todos é coerente.
- [ ] As abas e o tipo ficam na URL e sobrevivem ao reload.
