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

O GitHub guarda o código e publica o app de graça no **GitHub Pages**. Toda vez que uma mudança chega na branch `main`, um robô (o **GitHub Actions**) confere o código, roda os testes e publica a versão nova sozinho.

Pré-requisito: seção 1.6 concluída (você tem a **URL** e a **chave anon** do Supabase).

### 2.1 Criar a conta e o repositório
1. Acesse <https://github.com> e crie uma conta (botão **Sign up**), se ainda não tiver.
2. No canto superior direito, clique em **+** → **New repository**.
3. Preencha:
   - **Repository name:** `controle-producao`
   - Marque **Public**. (No plano gratuito, o GitHub Pages só funciona em repositório público. Não há senha nem chave secreta no código, então isso é seguro.)
   - **Não** marque "Add a README" (o projeto já tem os arquivos).
4. Clique em **Create repository**.
5. Envie o código para ele (quem cuida do código faz isso uma vez):
   ```bash
   git remote add origin https://github.com/<seu-usuario>/controle-producao.git
   git push -u origin main
   ```

> O endereço do app será `https://<seu-usuario>.github.io/controle-producao/`. Se você der outro nome ao repositório, o endereço muda junto, sem precisar alterar nada no código.

### 2.2 Cadastrar os secrets (URL e chave do Supabase)
O robô de publicação precisa dos dois valores da seção 1.6. Eles ficam guardados como **secrets** (ninguém consegue lê-los depois de salvos).

1. No repositório, clique em **Settings** (aba no topo).
2. No menu lateral, abra **Secrets and variables** → **Actions**.
3. Na aba **Secrets**, clique em **New repository secret**.
4. Crie o primeiro:
   - **Name:** `VITE_SUPABASE_URL`
   - **Secret:** a **Project URL** (ex.: `https://abcdxyz.supabase.co`)
   - Clique em **Add secret**.
5. Clique de novo em **New repository secret** e crie o segundo:
   - **Name:** `VITE_SUPABASE_ANON_KEY`
   - **Secret:** a chave **`anon` `public`** (ou a **Publishable key**)
   - Clique em **Add secret**.

> Os nomes precisam ser **exatamente** esses, em maiúsculas. **Nunca** cadastre aqui a chave `service_role` / **Secret key**.
> Se faltar algum secret, o deploy falha logo no primeiro passo com a mensagem "Secret faltando".

### 2.3 Ligar o GitHub Pages
1. Ainda em **Settings**, no menu lateral, clique em **Pages**.
2. Em **Build and deployment** → **Source**, escolha **GitHub Actions**.
   (Não escolha "Deploy from a branch".)
3. Não é preciso clicar em salvar: a escolha vale na hora.

### 2.4 Publicar pela primeira vez
1. Clique na aba **Actions** do repositório.
2. Se aparecer um aviso pedindo para habilitar os workflows, clique em **I understand my workflows, go ahead and enable them**.
3. No menu da esquerda, clique em **Deploy no GitHub Pages** → botão **Run workflow** → **Run workflow**.
   (Depois desta vez, todo push na `main` publica sozinho.)
4. Aguarde de 2 a 4 minutos. Quando a bolinha ficar **verde** (✓), clique na execução: o link do site aparece na caixa **deploy**.
5. Se ficar **vermelha** (✗), clique nela e abra o passo que falhou. Os casos mais comuns:
   - **"Secret faltando"** → volte ao passo 2.2.
   - **Lint/Testes/Build** → há um erro no código; nada foi publicado, o site antigo continua no ar.
   - **"Get Pages site failed"** ou erro no **deploy** → confira o passo 2.3 (Source = GitHub Actions).

### 2.5 Conferir se está tudo certo
1. Abra `https://<seu-usuario>.github.io/controle-producao/` no celular ou no computador.
2. A tela de login deve aparecer. Entre com o **admin** (seção 1.5).
3. (Opcional, no computador) No Chrome, aperte **F12** → aba **Lighthouse** → marque **Mobile** → **Analyze page load**. O app deve aparecer como instalável e sem aviso de ícone faltando.

### 2.6 Manter o Supabase acordado (keep-alive)
No plano gratuito, o Supabase **pausa** o projeto depois de cerca de 7 dias sem uso. Para evitar isso, o workflow **Keep-alive do Supabase** faz uma consulta simples ao Supabase toda **segunda e quinta-feira** (usa os mesmos secrets do passo 2.2, não precisa configurar nada).

Para testar agora:
1. Aba **Actions** → **Keep-alive do Supabase** → **Run workflow** → **Run workflow**.
2. A execução deve ficar **verde** e mostrar `Auth /auth/v1/health: 200`.

> O GitHub desliga workflows agendados de repositórios **sem nenhum commit há 60 dias** e manda um e-mail avisando. Se isso acontecer, abra **Actions** → **Keep-alive do Supabase** e clique em **Enable workflow**.
> Se o projeto já estiver pausado, abra o painel do Supabase e clique em **Restore project**.

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

---

## 4. Instalar o app no celular (Android)

O app é um **PWA**: funciona no navegador, mas pode ser instalado como um aplicativo, com ícone na tela inicial e abrindo em tela cheia. Não precisa de Play Store.

1. No celular, abra o **Google Chrome**.
2. Acesse `https://<seu-usuario>.github.io/controle-producao/`.
3. Se aparecer o aviso **"Instalar app"** (no próprio app ou na parte de baixo do Chrome), toque em **Instalar**.
4. Se não aparecer, toque no menu **⋮** (três pontinhos, canto superior direito) → **Instalar app** (em alguns celulares aparece **Adicionar à tela inicial**) → **Instalar**.
5. O ícone laranja com o caminhão aparece na tela inicial. Abra por ele: o app abre em tela cheia, sem a barra de endereço.

**iPhone (Safari):** abra o endereço no Safari → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**.

> O app precisa de internet para salvar e ver os lançamentos. Sem conexão, ele mostra o aviso "Sem conexão" e não grava nada.

### 4.1 Como o app se atualiza
- Não é preciso reinstalar nada. Quando uma versão nova é publicada (passo 2.4), o app baixa a atualização sozinho em segundo plano.
- A versão nova aparece na **próxima vez que você abrir** o app (feche-o totalmente e abra de novo, se estiver com pressa).
- Os números (lançamentos, totais, relatório) **sempre** vêm direto do servidor, nunca de uma cópia guardada no celular.
- Se algo parecer travado numa versão antiga: Chrome → **⋮** → **Configurações** → **Configurações do site** → **Todos os sites** → `github.io` → **Limpar e redefinir**. Depois abra o app de novo e faça login.
