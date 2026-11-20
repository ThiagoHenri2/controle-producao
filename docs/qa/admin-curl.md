# QA — Edge Function `admin-users` via curl

Testes manuais de segurança e contrato da função (spec 006 e spec 008, papel gerente). Só o **admin** usa a função; o **gerente** recebe 403. Rode num terminal com `curl` (Git Bash, WSL, macOS ou Linux).

## Placeholders
| Placeholder | O que é | Onde pegar |
|---|---|---|
| `<ANON_KEY>` | chave pública do projeto | Project Settings → API Keys → `anon` / Publishable |
| `<JWT>` | `access_token` de um usuário logado | ver "Como obter um JWT" abaixo |
| `<JWT_USER>` | JWT de um usuário **comum** | idem, logando com um usuário `role=user` |
| `<JWT_ADMIN>` | JWT do **admin** | idem, logando como `admin` |
| `<JWT_GERENTE>` | JWT de um **gerente** (ex.: `maria`, criada no passo 7) | idem, logando com `maria@entregas.local` |
| `<ID_DO_ADMIN>`, `<ID_JOAO>`, `<ID_MARIA>` | `id` (uuid) dos usuários | campo `user.id` das respostas de `create`, ou tabela `profiles` |

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
Faça login como `maria` para obter `<JWT_GERENTE>` e tente qualquer ação:
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

## Limpeza
Para remover os usuários de teste: Authentication → Users → `joao@entregas.local` / `maria@entregas.local` → Delete user (o profile e os dados são apagados em cascata; lançamentos que a Maria fez para outros continuam, com `criado_por` nulo).
