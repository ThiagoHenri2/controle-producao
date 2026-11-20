# Spec 010 — Troca de senha e atendentes por gerente

**Etapa:** 7 (melhoria) · **Agents:** db-supabase, frontend-ui, qa-tester · **Depende de:** 008, 009

## Objetivo
1. Todo usuário pode **trocar a própria senha**.
2. O **admin define os atendentes de cada gerente**. "Atendente" é o papel `user`, chamado de "Entregador" na UI até aqui; na UI ele passa a se chamar **Atendente**.
3. O **gerente** pode **redefinir a senha dos seus atendentes**.
4. O gerente passa a ver e operar **apenas os seus atendentes**, e não mais todos os usuários.

## Decisões (confirmadas pelo usuário em 20/11/2026)
- **Escopo do gerente:** a Equipe, o seletor "Lançando para", os relatórios, as categorias, os lançamentos e as despesas do gerente ficam limitados a **ele mesmo + os atendentes vinculados a ele**. O **admin continua vendo todos**.
- **Vínculo:** cada atendente tem **no máximo um gerente** (`profiles.gerente_id`).
- **Troca da própria senha:** exige a **senha atual**, a nova senha (≥ 6) e a confirmação.
- Isso substitui parte da decisão #8: o gerente deixa de ver todos (ver `docs/decisoes.md` #10).

## Banco (migration `0008_equipes.sql`)
- `profiles.gerente_id uuid null references public.profiles(id) on delete set null`.
  - `check (gerente_id is null or gerente_id <> id)`.
  - Índice em `gerente_id`.
- Trigger em `profiles` (before insert/update de `gerente_id`): se não for nulo, o perfil apontado deve ter `role = 'gerente'`; caso contrário, erro 23514 "O responsável precisa ser um gerente.".
- Trigger em `profiles` (after update de `role`): se um perfil deixa de ser `gerente`, os atendentes dele ficam com `gerente_id = null`.
- Nova função `pode_gerir(p_alvo uuid) returns boolean`:
  - `security definer`, `stable`, `search_path=public`;
  - quem chama precisa estar ativo;
  - retorna verdadeiro se `p_alvo = auth.uid()`, **ou** se quem chama é `is_admin()`, **ou** se quem chama é gerente ativo e `profiles(p_alvo).gerente_id = auth.uid()`.
- `is_gestor()` continua existindo, significando "é admin ou gerente ativo". Ele serve para mostrar e esconder telas, **não** para dar acesso a dados.
- **RLS** de `categorias`, `lancamentos`, `categorias_despesa` e `despesas`, nas 4 operações: `is_ativo() and pode_gerir(user_id)`.
- **profiles select:** `id = auth.uid() or is_admin() or (gerente_id = auth.uid() and is_gestor())`.
- **RPCs:**
  - Em `resumo_por_categoria`, `resumo_por_dia`, `resumo_despesas_por_categoria` e `resumo_despesas_por_dia`, a checagem de `p_usuario` alheio passa a ser `pode_gerir(p_usuario)` (erro 42501).
  - Em `resumo_por_usuario`, `resumo_por_usuario_nomes` e `resumo_despesas_por_usuario_nomes`:
    - o admin vê todos os perfis;
    - o gerente vê **ele mesmo + os atendentes dele**;
    - os demais recebem 42501.
  - `autores`: continua devolvendo só os autores de linhas visíveis ao chamador. Pela RLS nova, isso já fica restrito.
  - As assinaturas **não mudam**.
- `rls_check.sql`:
  - o gerente G1 com o atendente A vê, lança e opera dados de A;
  - o gerente G1 **não** vê nem opera dados do atendente B, que é de G2, nem os dados de G2;
  - a Equipe de G1 mostra só G1 + A;
  - o admin vê todos;
  - `gerente_id` apontando para quem não é gerente falha;
  - rebaixar G1 libera A (`gerente_id = null`);
  - o entregador não consegue alterar o próprio `gerente_id` (profiles continua sem update pelo cliente).

## Edge Function `admin-users`
- **Nova ação `set_gerente {user_id, gerente_id | null}`:**
  - só admin;
  - o alvo deve ter role `user`;
  - o `gerente_id` deve ser de um gerente ativo;
  - devolve o `user` com `gerente_id`.
- **`create`** aceita um `gerente_id?` opcional, só quando `role = 'user'`.
- **`reset_password`** passa a ser permitido para:
  - o admin, para qualquer usuário (como hoje);
  - o **gerente**, apenas para os seus atendentes (`target.gerente_id = caller`).

  Fora disso, 403.
- As demais ações continuam só para admin. O gerente recebe 403.
- O DTO de usuário passa a incluir `gerente_id`.

## Troca da própria senha (front, sem backend novo)
- Nova página **Minha conta** (`/conta`), acessível por um ícone de usuário (CircleUser) no header, ao lado do Sair. Ela mostra o nome, o @username, o papel e o gerente responsável, se houver.
- Formulário "Trocar senha":
  - campos: senha atual, nova senha e confirmar nova senha;
  - validação com Zod: nova senha ≥ 6, confirmação igual e nova diferente da atual.
  - Fluxo:
    1. `signInWithPassword(usernameToEmail(username), atual)` para conferir a senha atual. Se falhar, mostrar "Senha atual incorreta.".
    2. `supabase.auth.updateUser({ password: nova })`.
    3. Toast "Senha alterada." e limpar os campos.
  - Erro `weak_password` ou `same_password` do Supabase vira mensagem amigável.

## Front (demais)
- **Textos:** "Entregador" vira **"Atendente"** em toda a UI (selos, select de papel, menus).
- **Admin › Usuários:**
  - cada atendente mostra "Gerente: Maria" ou "Sem gerente";
  - no menu ⋮ do atendente, "Definir gerente…" abre um sheet com a lista de gerentes ativos + "Nenhum";
  - em "Novo usuário", com Papel = Atendente, aparece o select opcional "Gerente responsável";
  - cada gerente mostra "N atendentes".
- **Equipe (gerente):**
  - lista só ele + os atendentes dele, como já vem da RPC;
  - cada linha de atendente tem a ação **"Redefinir senha"** (menu ⋮ → sheet com nova senha + confirmação), que chama `admin-users` com `reset_password`;
  - o admin também tem essa ação para todos.
- **Seletor "Lançando para":** a lista vem de `profiles`, que pela RLS já devolve só os atendentes do gerente (ou todos, para o admin). Sem mudança de lógica, só confirmar.
- **Admin sem gerente definido:** nenhuma regra nova.

## Critérios de aceite
- [ ] O atendente troca a própria senha em Minha conta e entra com a nova; a senha atual errada é recusada.
- [ ] O admin vincula `joao` à gerente `maria`; a Maria vê só ela + o João na Equipe e no seletor.
- [ ] A Maria redefine a senha do João, que entra com a nova.
- [ ] A Maria **não** consegue redefinir a senha da Ana, que é de outro gerente (403), nem ver os dados dela.
- [ ] O admin continua vendo todos e redefinindo a senha de qualquer um.
- [ ] Rebaixar a Maria para atendente deixa o João sem gerente.
- [ ] A UI mostra "Atendente" no lugar de "Entregador".
