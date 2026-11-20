# QA — Edge Function `admin-users` via curl

Testes manuais de segurança e contrato da função (spec 006; spec 008, papel gerente; spec 010, atendentes por gerente). O **admin** usa todas as ações. O **gerente** só pode usar `reset_password`, e apenas para os **seus atendentes** (seção 9); qualquer outra ação dele recebe 403. Rode num terminal com `curl` (Git Bash, WSL, macOS ou Linux).

Todas as respostas de sucesso trazem `user = { id, username, nome, role, ativo, gerente_id }`.

## Placeholders
| Placeholder | O que é | Onde pegar |
|---|---|---|
| `<ANON_KEY>` | chave pública do projeto | Project Settings → API Keys → `anon` / Publishable |
| `<JWT>` | `access_token` de um usuário logado | ver "Como obter um JWT" abaixo |
| `<JWT_USER>` | JWT de um usuário **comum** | idem, logando com um usuário `role=user` |
| `<JWT_ADMIN>` | JWT do **admin** | idem, logando como `admin` |
| `<JWT_GERENTE>` | JWT de um **gerente** (ex.: `maria`, criada no passo 7) | idem, logando com `maria@entregas.local` |
| `<ID_DO_ADMIN>`, `<ID_JOAO>`, `<ID_MARIA>` | `id` (uuid) dos usuários | campo `user.id` das respostas de `create`, ou tabela `profiles` |
| `<ID_ANA>`, `<ID_PEDRO>` | `id` da atendente `ana` e do gerente `pedro` (criados na seção 9) | idem |

```bash
URL=https://vkkgnxydswffvwzhutnz.supabase.co/functions/v1/admin-users
ANON=<ANON_KEY>
```

### Como obter um JWT
```bash
curl -s -X POST "https://vkkgnxydswffvwzhutnz.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"joao@entregas.local","password":"123456"}'
# copie o campo "access_token" da resposta
```

## 1. Preflight CORS → 200
```bash
curl -i -X OPTIONS "$URL" \
  -H "Origin: https://exemplo.github.io" \
  -H "Access-Control-Request-Method: POST"
```
Esperado: `200`, com `Access-Control-Allow-Origin: *` e `Access-Control-Allow-Methods: POST, OPTIONS`.

## 2. POST sem token → 401
```bash
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"X","username":"xx1","password":"123456"}'
```
Esperado: `401`. Com "Verify JWT" ligado, quem responde é o gateway do Supabase (corpo `{"code":401,"message":...}`). Para testar o 401 da própria função, mande um token inválido:
```bash
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer invalido" \
  -H "Content-Type: application/json" -d '{"action":"create"}'
```
Esperado: `401` (gateway ou `{"error":"Sessão inválida ou expirada"}`).

## 3. Usuário comum → 403
```bash
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_USER>" \
  -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"Hacker","username":"hacker","password":"123456"}'
```
Esperado: `403` `{"error":"Acesso negado"}`, e **nenhum** usuário `hacker` criado.

## 4. Admin cria usuário → 200
```bash
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"João Silva","username":"Joao","password":"123456"}'
```
Esperado: `200` `{"ok":true,"user":{"id":"…","username":"joao","nome":"João Silva","role":"user","ativo":true}}` (username normalizado para minúsculas; sem `role` no corpo o papel é `user`). Em seguida, o login de `joao` / `123456` (comando "Como obter um JWT") deve funcionar.

## 5. Username duplicado → 409
Repita o comando do passo 4.
Esperado: `409` `{"error":"Usuário já existe"}`.

## 6. Extras
```bash
# payload inválido → 400
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" -d '{"action":"create","nome":"A","username":"a","password":"1"}'
# → {"error":"Usuário inválido: ..."}

# admin tentando se desativar → 400
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" -d '{"action":"set_active","user_id":"<ID_DO_ADMIN>","ativo":false}'
# → {"error":"Você não pode desativar a si mesmo."}

# desativar joao → 200; depois o login de joao deve falhar ("User is banned")
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" -d '{"action":"set_active","user_id":"<ID_JOAO>","ativo":false}'

# action desconhecida → 400
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" -d '{"action":"delete"}'
```

## 7. Papel gerente (spec 008)

### 7.1 Admin cria `maria` como gerente → 200
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>"   -H "Content-Type: application/json"   -d '{"action":"create","nome":"Maria","username":"maria","password":"123456","role":"gerente"}'
```
Esperado: `200` com `"role":"gerente"`. Guarde o `user.id` como `<ID_MARIA>`.

### 7.2 `role` inválido → 400
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>"   -H "Content-Type: application/json"   -d '{"action":"create","nome":"X","username":"xx9","password":"123456","role":"chefe"}'
# → 400 {"error":"Campo \"role\" deve ser \"user\", \"gerente\" ou \"admin\"."}
```
O mesmo erro vale para `set_role` com `role` fora de `user`/`gerente`/`admin`. Nenhum usuário `xx9` deve ter sido criado.

### 7.3 Gerente NÃO gerencia usuários → 403
Faça login como `maria` para obter `<JWT_GERENTE>` e tente qualquer ação que não seja `reset_password` (a exceção da spec 010 está na seção 9):
```bash
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>"   -H "Content-Type: application/json"   -d '{"action":"create","nome":"Hacker","username":"hacker2","password":"123456"}'
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>"   -H "Content-Type: application/json"   -d '{"action":"set_role","user_id":"<ID_MARIA>","role":"admin"}'
```
Esperado: `403` `{"error":"Acesso negado"}` nos dois, sem efeito (a Maria continua `gerente`).

### 7.4 `set_role` entre os três papéis → 200
```bash
# joao vira gerente
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>"   -H "Content-Type: application/json" -d '{"action":"set_role","user_id":"<ID_JOAO>","role":"gerente"}'
# → {"ok":true,"user":{...,"role":"gerente",...}}

# e volta a entregador
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>"   -H "Content-Type: application/json" -d '{"action":"set_role","user_id":"<ID_JOAO>","role":"user"}'
# → {"ok":true,"user":{...,"role":"user",...}}
```

### 7.5 Admin não se rebaixa → 400
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>"   -H "Content-Type: application/json" -d '{"action":"set_role","user_id":"<ID_DO_ADMIN>","role":"gerente"}'
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>"   -H "Content-Type: application/json" -d '{"action":"set_role","user_id":"<ID_DO_ADMIN>","role":"user"}'
```
Esperado nos dois: `400` `{"error":"Você não pode remover seu próprio acesso de administrador."}`, e o admin continua `admin`.

## 8. RPCs da spec 008 via REST (opcional)
Confere no banco (migration `0006_gerente.sql`) que o entregador não acessa os totais da equipe.
```bash
REST=https://vkkgnxydswffvwzhutnz.supabase.co/rest/v1/rpc

# entregador (joao) → erro 42501 (HTTP 403 ou 401 conforme o PostgREST), corpo com "Acesso negado"
curl -s -X POST "$REST/resumo_por_usuario" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_USER>"   -H "Content-Type: application/json" -d '{"p_de":"2026-11-01","p_ate":"2026-11-30"}'

# entregador pedindo o relatório de outro (p_usuario) → "Acesso negado"
curl -s -X POST "$REST/resumo_por_categoria" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_USER>"   -H "Content-Type: application/json" -d '{"p_de":"2026-11-01","p_ate":"2026-11-30","p_usuario":"<ID_MARIA>"}'

# gerente → 200 com uma linha por perfil (user_id, nome, username, role, ativo, quantidade, valor, total_geral)
curl -s -X POST "$REST/resumo_por_usuario" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>"   -H "Content-Type: application/json" -d '{"p_de":"2026-11-01","p_ate":"2026-11-30"}'

# gerente, só "Pizza" de todo mundo (nome, sem diferenciar maiúsculas)
curl -s -X POST "$REST/resumo_por_usuario_nomes" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>"   -H "Content-Type: application/json" -d '{"p_de":"2026-11-01","p_ate":"2026-11-30","p_nomes":["pizza"]}'
```

## 9. Atendentes por gerente (spec 010, migration `0008_equipes.sql`)
Pré-requisitos: `joao` (atendente) e `maria` (gerente) dos passos 4 e 7. Garanta que o `joao` esteja ativo e seja `user` (passos 6 e 7.4 podem tê-lo alterado).

### 9.1 Admin cria `pedro` (gerente) e `ana` (atendente de `pedro`) → 200
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"Pedro","username":"pedro","password":"123456","role":"gerente"}'
# → {"ok":true,"user":{...,"role":"gerente","gerente_id":null}}   guarde <ID_PEDRO>

curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"Ana","username":"ana","password":"123456","gerente_id":"<ID_PEDRO>"}'
# → {"ok":true,"user":{...,"role":"user","gerente_id":"<ID_PEDRO>"}}   guarde <ID_ANA>
```

### 9.2 `create` com `gerente_id` inválido → 400
```bash
# gerente_id em quem não é atendente
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"X","username":"xx10","password":"123456","role":"gerente","gerente_id":"<ID_MARIA>"}'
# → 400 {"error":"Só atendentes podem ter um gerente."}

# gerente_id de quem não é gerente (joao)
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"create","nome":"X","username":"xx11","password":"123456","gerente_id":"<ID_JOAO>"}'
# → 400 {"error":"O gerente informado precisa ser um gerente ativo."}
```
Nenhum usuário `xx10`/`xx11` deve ter sido criado.

### 9.3 Admin vincula `joao` à `maria` (`set_gerente`) → 200
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"set_gerente","user_id":"<ID_JOAO>","gerente_id":"<ID_MARIA>"}'
# → {"ok":true,"user":{...,"username":"joao","gerente_id":"<ID_MARIA>"}}
```
Erros esperados de `set_gerente`:

| Corpo | Status | `error` |
|---|---|---|
| sem `gerente_id` | 400 | `Campo "gerente_id" é obrigatório (identificador do gerente ou null).` |
| `gerente_id` não-uuid | 400 | `Campo "gerente_id" deve ser o identificador de um gerente ou null.` |
| `user_id` de um gerente/admin | 400 | `Só atendentes podem ter um gerente.` |
| `gerente_id` de atendente, admin, gerente inativo ou inexistente | 400 | `O gerente informado precisa ser um gerente ativo.` |
| `user_id` inexistente | 404 | `Usuário não encontrado.` |
| chamado pelo gerente | 403 | `Acesso negado` |

Para desvincular: `{"action":"set_gerente","user_id":"<ID_JOAO>","gerente_id":null}` → 200 com `"gerente_id":null`.

### 9.4 Gerente redefine a senha do SEU atendente → 200
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>" -H "Content-Type: application/json" \
  -d '{"action":"reset_password","user_id":"<ID_JOAO>","password":"nova123"}'
# → {"ok":true,"user":{...,"username":"joao","gerente_id":"<ID_MARIA>"}}
```
Em seguida, o login de `joao` / `nova123` deve funcionar.

### 9.5 Gerente NÃO redefine a senha de quem não é dele → 403
```bash
# ana é atendente do pedro
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>" -H "Content-Type: application/json" \
  -d '{"action":"reset_password","user_id":"<ID_ANA>","password":"hack12"}'
# o próprio gerente, outro gerente, o admin, ou um id inexistente: também 403
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>" -H "Content-Type: application/json" \
  -d '{"action":"reset_password","user_id":"<ID_DO_ADMIN>","password":"hack12"}'
```
Esperado: `403` `{"error":"Acesso negado"}`, e a senha da `ana` (e do admin) **não** muda. O id inexistente também dá 403 para o gerente (não revela quais ids existem); para o admin, dá 404.

### 9.6 Gerente não usa `set_gerente` → 403
```bash
curl -i -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>" -H "Content-Type: application/json" \
  -d '{"action":"set_gerente","user_id":"<ID_ANA>","gerente_id":"<ID_MARIA>"}'
# → 403 {"error":"Acesso negado"}
```

### 9.7 Admin continua redefinindo a senha de qualquer um → 200
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"reset_password","user_id":"<ID_ANA>","password":"123456"}'
```

### 9.8 Rebaixar a `maria` libera o `joao`
```bash
curl -s -X POST "$URL" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json" \
  -d '{"action":"set_role","user_id":"<ID_MARIA>","role":"user"}'
```
Depois, na tabela `profiles` (ou num `create`/`set_gerente` que devolva o joao), o `joao` fica com `gerente_id = null`. Promover um atendente (`set_role` para `gerente`/`admin`) também limpa o `gerente_id` dele. Se for continuar os testes, volte a `maria` para `gerente` e refaça o 9.3.

### 9.9 Escopo do gerente nos dados (REST, opcional)
Com `joao` vinculado à `maria` e `ana` vinculada ao `pedro`:
```bash
REST=https://vkkgnxydswffvwzhutnz.supabase.co/rest/v1

# a maria vê só ela + joao
curl -s "$REST/profiles?select=username,gerente_id" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>"

# Equipe da maria: só maria + joao
curl -s -X POST "$REST/rpc/resumo_por_usuario" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>" \
  -H "Content-Type: application/json" -d '{"p_de":"2026-11-01","p_ate":"2026-11-30"}'

# relatório da ana pela maria → erro 42501 "Acesso negado"
curl -s -X POST "$REST/rpc/resumo_por_categoria" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_GERENTE>" \
  -H "Content-Type: application/json" -d '{"p_de":"2026-11-01","p_ate":"2026-11-30","p_usuario":"<ID_ANA>"}'

# o joao vê o próprio gerente
curl -s -X POST "$REST/rpc/meu_gerente" -H "apikey: $ANON" -H "Authorization: Bearer <JWT_USER>" \
  -H "Content-Type: application/json" -d '{}'
# → [{"id":"<ID_MARIA>","nome":"Maria","username":"maria"}]
```

## Limpeza
Para remover os usuários de teste: Authentication → Users → `joao@entregas.local` / `maria@entregas.local` / `pedro@entregas.local` / `ana@entregas.local` → Delete user. O profile e os dados são apagados em cascata; lançamentos que a Maria fez para outros continuam, com `criado_por` nulo; os atendentes de um gerente excluído ficam sem gerente.
