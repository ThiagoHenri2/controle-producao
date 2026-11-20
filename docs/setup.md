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

## 3. Edge Function de administração de usuários

_Em breve — será escrito na spec 006 (Admin usuários): deploy da função `admin-users` e configuração da `service_role`._
