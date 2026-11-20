# Spec 011 — Privacidade do atendente perante o gerente

**Etapa:** 8 (melhoria) · **Agents:** db-supabase, frontend-ui, qa-tester (modelo **Sonnet 5.5**, a pedido do usuário) · **Depende de:** 010 (gerente_id, `pode_gerir`)

## Objetivo
O **atendente** decide quais das suas **categorias de lançamento** o seu gerente pode ver. O gerente **nunca** vê as **despesas** dos atendentes.

## Decisões (confirmadas pelo usuário em 20/11/2026)
- **Padrão: o gerente não vê** uma categoria até o atendente autorizar. Isso vale para as categorias existentes, que ficam **ocultas** após a migration, e para as novas.
  - **Exceção:** uma categoria criada **pelo gerente** para o atendente já nasce visível para ele.
- Cada atendente tem um gerente só (spec 010), então a permissão é um **flag por categoria**: "visível para meu gerente".
- **Despesas** e **categorias de despesa** do atendente ficam **invisíveis para o gerente**, para ver, lançar, editar e excluir.
- **O admin não é afetado:** continua vendo e operando tudo.
- O gerente continua vendo e operando os **próprios** dados normalmente.

## Banco (migration `0009_privacidade_atendente.sql`)
- `categorias.visivel_gerente boolean not null default false`. As linhas existentes ficam `false`.
- **Trigger em `categorias`** (before insert/update):
  - **insert:** se `auth.uid()` ≠ `user_id` e quem chama é o gerente do dono, forçar `visivel_gerente = true`. Se quem chama é o próprio dono, respeitar o valor enviado (o padrão é false).
  - **update de `visivel_gerente`:** só o **dono** ou o **admin** podem mudar. Se o gerente tentar, erro 42501 "Apenas o atendente pode alterar a visibilidade.".
- **Função `pode_ver_categoria(p_categoria_id uuid)`:** `security definer`, `stable`. Retorna verdadeiro se quem chama:
  - é o dono, **ou**
  - é admin, **ou**
  - é o gerente do dono e a categoria tem `visivel_gerente`.
- **Função `pode_gerir_despesas(p_alvo uuid)`:** verdadeiro se `p_alvo = auth.uid()` **ou** se quem chama é admin, sempre com quem chama ativo.
- **RLS:**
  - `categorias`: `is_ativo() and (user_id = auth.uid() or is_admin() or (pode_gerir(user_id) and visivel_gerente))`, nas 4 operações.
    - O insert do gerente passa, porque o trigger força o flag e o with check vê `true`.
  - `lancamentos`: `is_ativo() and pode_gerir(user_id) and pode_ver_categoria(categoria_id)`, nas 4 operações.
    - O gerente só vê, lança, edita e exclui lançamentos em categorias liberadas.
  - `categorias_despesa` e `despesas`: `is_ativo() and pode_gerir_despesas(user_id)`.
- **RPCs (as assinaturas não mudam):**
  - `resumo_por_categoria` e `resumo_por_dia` com `p_usuario` de um atendente: somam só as categorias visíveis para o gerente. Para o dono e para o admin, nada muda.
  - `resumo_por_usuario` e `resumo_por_usuario_nomes` para o gerente: os valores dos atendentes consideram só as categorias liberadas; os do próprio gerente consideram tudo.
  - `resumo_despesas_por_categoria` e `resumo_despesas_por_dia` com `p_usuario` alheio: exigem `pode_gerir_despesas`, senão 42501.
  - `resumo_despesas_por_usuario_nomes`:
    - o **admin** vê todos;
    - o **gerente** recebe só a própria linha (os atendentes **não aparecem**);
    - os demais recebem 42501.
  - `autores`: segue a RLS nova.
- `rls_check.sql`:
  - a categoria oculta não aparece para o gerente, nem nos lançamentos, nem nos resumos;
  - liberar → aparece; ocultar de novo → some;
  - o gerente não consegue mudar o flag (42501);
  - a categoria criada pelo gerente nasce visível;
  - o gerente não vê, não insere e não altera despesas nem categorias de despesa do atendente;
  - os resumos de despesas da equipe para o gerente só têm a linha dele;
  - o admin vê tudo;
  - o dono vê tudo dele.

## Front
- **Categorias › Entregas, visão do próprio atendente** (só quando o usuário tem gerente, conforme `meu_gerente()`):
  - cada categoria tem o switch **"Visível para <nome do gerente>"**, com alvo de toque ≥ 44px;
  - no topo, o aviso "Seu gerente <nome> só vê as categorias marcadas.";
  - no sheet de criar e editar, o mesmo switch, desmarcado por padrão;
  - as ações rápidas **"Mostrar todas"** e **"Ocultar todas"**.
- **Categorias, gerente vendo um atendente:**
  - a lista mostra só as liberadas, com a nota "Você vê apenas as categorias liberadas por <atendente>.";
  - o switch de visibilidade **não** aparece;
  - criar categoria continua funcionando, e ela nasce visível.
- **Lançar, gerente com alvo = atendente:**
  - a aba **Despesas fica oculta**;
  - em Entregas aparecem só as categorias liberadas;
  - sem nenhuma liberada: EmptyState "<atendente> ainda não liberou nenhuma categoria para você.".
- **Relatório, gerente com alvo = atendente:**
  - o seletor de tipo fica escondido e o relatório mostra só Receitas;
  - a nota "Mostrando apenas categorias liberadas por <atendente>." aparece.
- **Equipe, gerente:**
  - o seletor de tipo é escondido e a tela mostra só Receitas;
  - o subtítulo diz "Valores consideram apenas as categorias liberadas por cada atendente.";
  - o **admin** mantém o seletor completo.
- O `useAuth` já expõe o papel. Use `isAdmin` para distinguir admin de gerente nessas regras.

## Desvios da implementação do front (T011.3 a T011.5)
- Regras centralizadas em `usePermissoesAlvo(alvo)` e `useGerenteRestrito()` (`src/features/equipe/usePermissoesAlvo.ts`). O hook recebe o `UsuarioAlvo` já calculado em vez de chamá-lo por dentro. "Gerente" aqui é `isGerente && !isAdmin`.
- O switch só aparece quando `meu_gerente` devolve um gerente (a RPC roda só quando o alvo é o próprio usuário). Se a RPC falhar, o front trata como "sem gerente".
- Cada `CategoriaItem` virou um cartão com o botão de editar em cima e, embaixo, a linha do switch; assim o toque no switch nunca abre o sheet. Toggle otimista com rollback; a falha mostra o toast "Não foi possível alterar a visibilidade. Tente de novo.".
- "Mostrar todas"/"Ocultar todas" ficam acima da lista (só com categorias cadastradas), com confirmação curta.
- Gerente sem categorias liberadas: o EmptyState de Lançar traz também o link "Cadastrar categorias", porque o gerente pode criar (nasce visível).
- Telas escondem o seletor de tipo e as abas em vez de desabilitá-los; `tipo`, `dcats`, `dnomes` e `aba=despesas` da URL são ignorados (a URL não é reescrita).
- Testes pré-existentes de Despesas (Lançar e Equipe) usavam um "gerente" operando despesas de atendentes, o que a 0009 proíbe. O usuário logado deles passou a ser admin.
- O fake de categorias ganhou `setVisao({ uid, admin, atendentes })`, que simula a RLS da 0009 (filtro de leitura, 42501 na troca do flag e insert do gerente forçado como visível).
- Não foi possível verificar contra o banco real aqui: a verificação fica na T011.6.

## Critérios de aceite
- [ ] Logo após a migration, o gerente vê as categorias do atendente vazias e a Equipe com R$ 0,00 para ele, enquanto o admin vê tudo.
- [ ] O atendente libera "Pizza": o gerente passa a ver Pizza, os lançamentos e o total dela, e o Sanduíche continua oculto.
- [ ] O gerente não consegue alterar a visibilidade (nem por API).
- [ ] Uma categoria criada pelo gerente para o atendente aparece para os dois.
- [ ] O gerente não vê a aba Despesas do atendente, e a API não retorna despesas do atendente para ele.
- [ ] Na Equipe, o gerente só tem Receitas; o admin tem Receitas, Despesas e Ambos.
- [ ] O atendente sem gerente não vê o switch.
