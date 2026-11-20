# Guia de configuração (setup)

Este guia mostra, passo a passo, como deixar o app funcionando. Não é preciso saber programar: basta seguir na ordem.

---

## 1. Supabase (banco de dados e login)

O Supabase guarda os dados e cuida do login. O plano gratuito é suficiente.

### 1.1 Criar o projeto
1. Acesse <https://supabase.com> e entre (pode usar a conta do GitHub).
2. Clique em **New project**.
3. Preencha:
   - **Name:** `controle-producao` (ou outro nome de sua preferência).
   - **Database Password:** clique em **Generate a password** e **guarde essa senha** num lugar seguro.
   - **Region:** **South America (São Paulo)** — `sa-east-1`.
4. Clique em **Create new project** e aguarde 1 a 2 minutos até ele ficar pronto.

### 1.2 Bloquear cadastro público e confirmação de e-mail
Só o administrador cria usuários. Por isso, ninguém pode se cadastrar sozinho.

1. No menu lateral, abra **Authentication** → **Sign In / Providers**.
2. Na parte de configurações gerais de usuário, **desative** **"Allow new users to sign up"**.
3. Em **Email**, **desative** **"Confirm email"** (os e-mails do app são internos, do tipo `joao@entregas.local`, e não recebem mensagens).
4. Clique em **Save** em cada seção alterada.

> Os nomes dos menus podem mudar um pouco em versões novas do painel. Procure sempre por "Sign up" e "Confirm email".

### 1.3 Criar as tabelas (aplicar a migration)
1. No menu lateral, abra **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/migrations/0001_schema_inicial.sql` deste repositório, copie **todo** o conteúdo e cole no editor.
3. Clique em **Run**. Deve aparecer "Success. No rows returned".

> Quem usa a linha de comando pode trocar este passo por `npx supabase login`, `npx supabase link --project-ref <ref>` e `npx supabase db push`.

### 1.4 Conferir a segurança (opcional, recomendado)
1. Ainda no **SQL Editor**, abra uma **New query**.
2. Cole todo o conteúdo de `supabase/tests/rls_check.sql` e clique em **Run**.
3. O resultado deve ser uma linha com **`RLS OK`**. O teste não deixa nenhum dado gravado.
   Se aparecer um erro com "VAZAMENTO" ou "assertion", **não use o app** e avise o responsável técnico.

### 1.5 Criar o primeiro administrador
1. No menu lateral, abra **Authentication** → **Users**.
2. Clique em **Add user** → **Create new user**.
3. Preencha:
   - **Email:** `admin@entregas.local`
   - **Password:** escolha uma senha forte e guarde.
   - Marque **Auto Confirm User**.
4. Clique em **Create user**.
5. Volte ao **SQL Editor** → **New query**, cole o conteúdo de `supabase/seed_admin.sql` e clique em **Run**.
6. O resultado deve mostrar uma linha com `username = admin`, `role = admin` e `ativo = true`.
   Se vier vazio, o usuário do passo 3 não foi criado com o e-mail exato `admin@entregas.local`.

No app, o admin entra com o usuário **`admin`** e a senha escolhida.

### 1.6 Pegar a URL e a chave pública do projeto
O app precisa de dois valores:

| Variável | Onde encontrar |
|---|---|
| `VITE_SUPABASE_URL` | **Project Settings** → **Data API** → **Project URL** (algo como `https://abcdxyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | **Project Settings** → **API Keys** → chave **`anon` `public`** (ou a **Publishable key**, que começa com `sb_publishable_`) |

1. Na raiz do projeto, copie o arquivo `.env.example` para `.env.local`.
2. Cole os dois valores nele.

> **Nunca** use a chave `service_role` (ou **Secret key**) no app nem a coloque em arquivos do repositório. Ela só vai nas Edge Functions.

---

## 2. GitHub (hospedagem e deploy)

_Em breve — será escrito na spec 007 (PWA e Deploy): repositório, secrets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, GitHub Pages e keep-alive._

---

## 3. Edge Function admin-users

A tela **Usuários** do app (só para admin) cria usuários, redefine senhas, ativa/desativa e muda o papel. Essas ações exigem a chave secreta `service_role`, que **nunca** vai para o app. Por isso elas rodam numa Edge Function do Supabase chamada **`admin-users`**.

- Código: `supabase/functions/admin-users/index.ts` (um único arquivo, sem dependências locais).
- Variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são preenchidas **automaticamente** pelo Supabase. Não é preciso criar secrets.
- O nome precisa ser exatamente **`admin-users`** (o app chama a função por esse nome).
- **"Verify JWT" deve ficar LIGADO** (é o padrão). Assim o Supabase recusa chamadas sem login antes mesmo de rodar o código. A função ainda confere, por conta própria, se quem chama é admin ativo (senão responde 403).

Pré-requisito: seções 1.3 (tabelas) e 1.5 (primeiro admin) concluídas.

### 3.1 Opção A — pelo painel (sem instalar nada)
1. No menu lateral do Supabase, abra **Edge Functions**.
2. Clique em **Deploy a new function** → **Via Editor**.
3. No campo de nome, digite **`admin-users`**.
4. Apague o código de exemplo do editor.
5. Abra `supabase/functions/admin-users/index.ts` deste repositório, copie **todo** o conteúdo e cole no editor.
6. Clique em **Deploy function** e aguarde a confirmação.
7. Abra a função na lista → **Details** (ou **Settings**) e confira que **"Verify JWT with legacy secret"** / **"Enforce JWT verification"** está **ligado**.

Para atualizar depois: abra a função → aba **Code**, cole a versão nova e clique em **Deploy** de novo.

### 3.2 Opção B — pela linha de comando
Requer Node.js instalado. Na raiz do projeto:

```bash
npx supabase login
npx supabase functions deploy admin-users --project-ref vkkgnxydswffvwzhutnz
```

O `login` abre o navegador uma única vez. O deploy mantém "Verify JWT" ligado (não use `--no-verify-jwt`).

### 3.3 Conferir
1. Entre no app como **admin** → **Usuários** → **Novo usuário**; crie `joao` com senha `123456`.
2. Saia e entre como `joao` / `123456`: o login deve funcionar.
3. Logs de erro: **Edge Functions** → `admin-users` → **Logs**.
4. Testes por linha de comando (401/403/409): veja `docs/qa/admin-curl.md`.
