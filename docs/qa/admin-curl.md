# QA — Edge Function `admin-users` via curl

Testes manuais de segurança e contrato da função (spec 006). Rode num terminal com `curl` (Git Bash, WSL, macOS ou Linux).

## Placeholders
| Placeholder | O que é | Onde pegar |
|---|---|---|
| `<ANON_KEY>` | chave pública do projeto | Project Settings → API Keys → `anon` / Publishable |
| `<JWT>` | `access_token` de um usuário logado | ver "Como obter um JWT" abaixo |
| `<JWT_USER>` | JWT de um usuário **comum** | idem, logando com um usuário `role=user` |
| `<JWT_ADMIN>` | JWT do **admin** | idem, logando como `admin` |

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
Esperado: `200` `{"ok":true,"user":{"id":"…","username":"joao","nome":"João Silva","role":"user","ativo":true}}` (username normalizado para minúsculas). Em seguida, o login de `joao` / `123456` (comando "Como obter um JWT") deve funcionar.

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

## Limpeza
Para remover o usuário de teste: Authentication → Users → `joao@entregas.local` → Delete user (o profile e os dados são apagados em cascata).
