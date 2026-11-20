# Spec 008 — Papel Gerente (pagamento dos entregadores)

**Etapa:** 5 (melhoria) · **Agents:** db-supabase, frontend-ui, qa-tester · **Depende de:** 002–007

## Objetivo
Criar o papel **gerente** para acompanhar **quanto será pago a cada entregador**: a soma por usuário e o total de todos, num período. O gerente também pode lançar, corrigir e excluir lançamentos e gerenciar as categorias e preços de qualquer entregador.

## Decisões (confirmadas pelo usuário em 20/11/2026)
- **Papéis:** `user` (entregador), `gerente`, `admin`.
  - O **admin inclui todos os poderes do gerente** e, além disso, gerencia usuários.
  - Na spec, "gestor" = gerente **ou** admin, ativo.
- **Categorias e preços continuam por entregador.** Quando o gestor lança para alguém, valem as categorias e os preços **daquele entregador**.
- O gestor pode:
  - ver os totais de todos;
  - lançar para qualquer entregador;
  - editar e excluir lançamentos de qualquer um;
  - gerenciar as categorias de qualquer um;
  - ter os próprios lançamentos.
- **Auditoria:** cada lançamento grava **quem criou** (`criado_por`). Na lista do entregador, um lançamento feito por outra pessoa mostra o selo "por <nome>".
- Isso **substitui** a regra da spec 002/006 "admin não vê lançamentos dos outros" (ver `docs/decisoes.md` #8).

## Histórias
- Como gerente, abro **Equipe**, escolho o período e vejo cada entregador com o nº de entregas e o **valor a pagar**, mais o **total de todos**.
- Como gerente, toco num entregador e vejo o relatório dele (por categoria e por dia), com o mesmo filtro de categorias do Relatório.
- Como gerente, na tela **Lançar**, escolho "Lançando para: João" e lanço com as categorias e preços do João.
- Como gerente, corrijo ou excluo um lançamento do João.
- Como gerente, em **Categorias**, escolho o João e ajusto as categorias e preços dele.
- Como entregador, vejo "por Maria (gerente)" nos lançamentos que a gerente fez por mim.
- Como entregador, continuo **sem** ver nada dos outros.
- Como admin, posso tornar alguém gerente.

## Banco (migration `0006_gerente.sql`)
- `profiles.role`: o check passa a aceitar `('admin','gerente','user')`.
- `is_gestor()`: `security definer`, `stable`, `search_path=public`. Retorna `exists(profile do auth.uid() com role in ('admin','gerente') and ativo)`.
- **`lancamentos.criado_por`**:
  - `uuid null default auth.uid() references auth.users on delete set null` (nullable por causa do `set null`). As linhas antigas são preenchidas com `user_id` (backfill). Há um índice em `criado_por`.
  - Um trigger before insert força `criado_por = auth.uid()` quando houver `auth.uid()`, para ninguém forjar o autor.
  - No update, `criado_por` não muda.
- **RLS** (categorias e lançamentos), em todas as operações: `is_ativo() and (user_id = auth.uid() or is_gestor())`.
  - O gestor insere com `user_id` = o entregador alvo.
  - O trigger de snapshot já exige que a categoria pertença ao mesmo `user_id`, e isso continua valendo.
- **profiles select:** `id = auth.uid() or is_gestor()` (o gestor precisa listar os entregadores).
- **RPCs de resumo**: recriar com um parâmetro a mais, mantendo a compatibilidade:
  ```
  resumo_por_categoria(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
  resumo_por_dia(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
  ```
  - `p_usuario` null = o próprio `auth.uid()`.
  - Se for diferente de `auth.uid()`, exige `is_gestor()`; caso contrário, `raise` com errcode `42501` "Acesso negado".
  - Fazer `drop` das assinaturas `(date, date, uuid[])` antes de recriar.
- **Nova RPC** (só gestor, senão `42501`):
  ```
  resumo_por_usuario(p_de date, p_ate date, p_categorias uuid[] default null)
    returns table (user_id uuid, nome text, username text, role text, ativo boolean,
                   quantidade bigint, valor numeric, total_geral numeric)
  ```
  - Usa `p_categorias` como filtro por **id** de categoria. Como as categorias são por usuário, o front também oferece um filtro por **nome**, descrito abaixo.
  - Inclui **todos os perfis**, até quem teve 0 no período (com quantidade 0 e valor 0), para o gerente ver quem não produziu.
  - Ordenação: `valor desc, nome`.
  - `total_geral` = soma de todos.
- **Nova RPC** `resumo_por_usuario_nomes(p_de, p_ate, p_nomes text[] default null)`: mesmo retorno, mas filtra por `lower(btrim(categorias.nome)) = any(p_nomes normalizados)`. É o que a tela Equipe usa para "somar só Pizza de todo mundo".
- **Nova RPC** `autores(p_ids uuid[]) returns table (id uuid, nome text)`:
  - `security definer`;
  - devolve só os nomes de usuários que sejam `criado_por` de algum lançamento visível ao chamador (próprio `user_id`, ou qualquer um se for gestor);
  - serve para o selo "por <nome>" sem expor `profiles` ao entregador.
- Grants: `revoke` de public e anon; `grant execute` para authenticated e service_role.
- `rls_check.sql` ampliado:
  - o gerente vê, lança, edita e exclui para o entregador A;
  - o entregador B continua isolado;
  - `criado_por` não pode ser forjado;
  - `resumo_por_usuario` dá 403 para quem não é gestor;
  - `p_usuario` de outro usuário dá 403 para quem não é gestor;
  - o admin também é gestor.

## Edge Function `admin-users`
- `set_role` aceita `'gerente'`.
- `create` aceita um `role` opcional (`'user'` por padrão).
- Continua vetado: o admin rebaixar a si mesmo (para `user` **ou** `gerente`).
- Só o **admin** usa a função; o gerente **não** gerencia usuários.

## Front
- `useAuth`: `role`, `isAdmin`, `isGerente`, `isGestor` (admin ou gerente).
- **Seletor de entregador** `UsuarioAlvoSelect`, só para gestor, no topo de Lançar, Categorias e Relatório:
  - mostra "Lançando para: **Eu**" / "**João**";
  - abre um BottomSheet com a lista de perfis ativos (nome + @username), com "Eu" primeiro;
  - fica na URL como `?usuario=<id>`;
  - fora do próprio usuário, mostra a faixa "Você está vendo/lançando como gestor para João".
- **Lançar**:
  - as categorias e a lista "Já lançado" são do usuário alvo, e o insert envia `user_id` = alvo;
  - editar e excluir funcionam como hoje;
  - o selo "por <nome>" aparece quando `criado_por` ≠ `user_id`, para todos os usuários.
- **Categorias:** o CRUD é feito sobre as categorias do usuário alvo. O insert envia `user_id` = alvo.
- **Relatório:** o gestor pode escolher o entregador (`p_usuario`).
- **Equipe** (`/equipe`, nova rota protegida por `GestorRoute`; item "Equipe" na BottomNav para o gestor):
  - mesmos chips de período do Relatório (reutilizar `periodos.ts` e os componentes);
  - card "Total a pagar (todos)" com R$ e nº de entregas;
  - filtro de categorias **por nome**, em checklist com a união dos nomes de todas as categorias de todos os usuários, sem diferenciar maiúsculas;
  - lista por entregador com nome, @username, selo de papel e inativo, entregas e **R$ a pagar**, mais a barra percentual;
  - quem tem 0 aparece no fim, esmaecido;
  - tocar num entregador abre `/relatorio?usuario=<id>&...` com o mesmo período.
- **Admin › Usuários:**
  - o menu de papel passa a ter "Tornar gerente", "Tornar admin" e "Tornar entregador";
  - o formulário "Novo usuário" ganha o select Papel (Entregador, que é o padrão; Gerente; Admin);
  - os selos de papel são "Entregador", "Gerente" e "Admin".
- **BottomNav:**
  - entregador: Lançar · Relatório · Categorias;
  - gerente: + Equipe;
  - admin: + Equipe + Usuários (5 itens, que precisam caber em 360px).

## Notas de implementação do front (T008.4–T008.9)
- **Filtro explícito por dono:** como a RLS deixa o gestor ver as linhas de todos, as listas de Lançar e Categorias sempre filtram com `.eq('user_id', alvo)`, inclusive quando o alvo é "eu". O insert de lançamentos e categorias também sempre envia `user_id` (para o próprio usuário, isso equivale ao default `auth.uid()`). `criado_por` nunca é enviado.
- **`p_usuario`** só é enviado quando o alvo é outro usuário. Para "eu", o parâmetro é omitido, o que mantém a compatibilidade com o banco anterior à 0006.
- **Query keys por dono:** `['categorias','list',userId,…]`, `['lancamentos',userId,data]`, `['resumo',userId,de,ate,cats]`. A Equipe fica em `['resumo','equipe',de,ate,nomes]`, então as mutations de lançamento (que invalidam `['resumo']`) também atualizam a Equipe. Os nomes do selo usam `['autores', ids ordenados]`.
- **`?usuario` inválido:** para o gestor, um id que não está na lista de perfis (depois de carregada) vale como "eu". Para o entregador, o parâmetro é sempre ignorado.
- **A navegação pela BottomNav não leva `?usuario`.** Ao trocar de aba, o alvo volta a ser "eu". Os links internos levam o alvo: o "Cadastrar categorias" de Lançar, o "Lançar entregas" do Relatório vazio e Equipe → Relatório.
- **O seletor tem rótulo por tela:** "Lançando para" (Lançar), "Categorias de" (Categorias) e "Relatório de" (Relatório). A faixa diz "lançando" em Lançar e "vendo" nas outras telas. O bloco do gestor é índigo e fica acima da data; a faixa âmbar de data continua abaixo do seletor de data. A faixa tem o atalho "Voltar para mim".
- **Lista do seletor:** "Eu" primeiro, depois os perfis ativos por nome. Um alvo inativo (aberto pela Equipe) continua na lista. A lista vem da mesma query da tela de admin (`profiles`, todos os perfis).
- **Selo:** mostra "por <nome>", sem o papel entre parênteses, porque a RPC `autores` devolve só `(id, nome)`.
- **Equipe:** o filtro por nome fica na URL como parâmetro repetido (`?nomes=pizza&nomes=sanduíche`), porque um nome de categoria pode conter vírgula. As chaves são normalizadas com trim + minúsculas, e a checklist mostra a grafia mais comum. Na lista, o selo de papel aparece só para Gerente/Admin, e o selo Inativo aparece quando o perfil está inativo. Com total 0, aparece um aviso acima da lista, que continua visível (toda esmaecida). O erro 42501 mostra "Acesso negado…".
- **Admin:** o menu ⋮ mostra os dois papéis diferentes do atual, todos com confirmação. "Tornar entregador" fica em destaque de perigo. O menu continua indisponível sobre si mesmo.
- **BottomNav:** com 5 itens, o rótulo usa 11px com `tracking-tight` para caber em 360px. A ordem é Lançar · Relatório · Categorias · Equipe (ícone Wallet) · Usuários.

## Critérios de aceite
- [ ] O admin cria `maria` como gerente; a Maria vê Equipe e não vê Usuários.
- [ ] Equipe com João (50 × 2,50 + 20 × 5,00 = R$ 225,00) e Ana (10 × 3,00 = R$ 30,00) mostra João R$ 225,00, Ana R$ 30,00 e o total R$ 255,00.
- [ ] Na Equipe, filtrar só "Pizza" mostra João R$ 100,00, Ana R$ 0,00 e o total R$ 100,00.
- [ ] A Maria lança 5 Pizzas para o João, que vê o lançamento com o selo "por Maria".
- [ ] A Maria edita e exclui um lançamento do João; a Maria altera o preço de uma categoria do João.
- [ ] O João (entregador) continua sem ver nada da Ana, e uma chamada a `resumo_por_usuario` com o JWT dele recebe erro.
- [ ] `criado_por` não pode ser forjado via API.
- [ ] O admin tem tudo o que o gerente tem, mais Usuários.
- [ ] O app publicado sem a migration 0006 não quebra durante a transição (a ordem de deploy é: banco → função → front).
