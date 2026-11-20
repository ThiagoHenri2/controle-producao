# Spec 006 — Administração de usuários

**Etapa:** 2 · **Agents:** db-supabase (Edge Function), frontend-ui (tela), qa-tester · **Depende de:** 002

## Objetivo
Permitir que o **admin** crie e gerencie os usuários do sistema, já que o cadastro público está desativado.

## Histórias
- Como admin, crio um usuário informando nome, usuário (login) e senha inicial.
- Como admin, vejo a lista de usuários (nome, usuário, papel, ativo).
- Como admin, redefino a senha de um usuário que esqueceu.
- Como admin, desativo e reativo um usuário. O desativado perde o acesso, mas os dados dele ficam preservados.
- Como admin, promovo um usuário a admin (opcional, com confirmação).
- O admin **não** vê lançamentos nem valores dos outros usuários (privacidade).

## Regras de negócio
- `username`: de 3 a 30 caracteres, `[a-z0-9._-]`, único; é convertido para minúsculas.
- Senha: no mínimo 6 caracteres (padrão do Supabase).
- O admin não pode desativar nem rebaixar a si mesmo (evita ficar sem admin).
- Desativar = `profiles.ativo=false` + `auth.admin.updateUserById(id, { ban_duration: '876000h' })`. Reativar = `ativo=true` + `ban_duration: 'none'`.

## Edge Function `admin-users` (`supabase/functions/admin-users/index.ts`)
Um único endpoint `POST` com `{ action, ... }`:
| action | payload | efeito |
|---|---|---|
| `create` | `{ nome, username, password }` | `auth.admin.createUser({ email: username@entregas.local, password, email_confirm: true })` + insert em `profiles` |
| `reset_password` | `{ user_id, password }` | `auth.admin.updateUserById` |
| `set_active` | `{ user_id, ativo }` | atualiza o profile + ban/unban |
| `set_role` | `{ user_id, role }` | atualiza `profiles.role` |

Fluxo comum:
1. Tratar `OPTIONS` (CORS).
2. Ler `Authorization: Bearer <jwt>` → `supabase.auth.getUser(jwt)` → 401 se inválido.
3. Conferir `profiles.role='admin' and ativo` de quem chama → 403 se não for admin.
4. Validar o payload (`username` duplicado → 409 "Usuário já existe").
5. Se o insert em `profiles` falhar após criar o auth user, apagar o auth user (rollback manual).

> Obs.: o plano previa o nome `admin-create-user`; ele foi consolidado em `admin-users`, porque é uma única função com várias ações.

A listagem de usuários **não** precisa da função: o select em `profiles` já é liberado ao admin pela RLS (spec 002).

## Front (`src/features/admin/`)
- `api.ts`: `supabase.functions.invoke('admin-users', { body })` + `listProfiles()`.
- `UsuariosPage` (rota `/admin/usuarios`, protegida por `AdminRoute`); a BottomNav mostra o item "Usuários" só para admin.

## Wireframe
```
┌──────────────────────────────┐
│ Usuários                     │
├──────────────────────────────┤
│ João Silva        @joao  ●   │  ● ativo / ○ inativo
│ user                    [⋮]  │  → Redefinir senha / Desativar / Tornar admin
│ Maria             @maria ●   │
│ admin                        │
│                              │
│ [  ＋ Novo usuário          ] │
└──────────────────────────────┘
Sheet "Novo usuário": Nome / Usuário / Senha (👁) / [Criar]
```

## Critérios de aceite
- [ ] O admin cria `joao` / senha `123456`; `joao` faz login no app.
- [ ] Criar um username repetido mostra "Usuário já existe".
- [ ] Um usuário comum que chama a função diretamente (curl com o próprio JWT) recebe **403**.
- [ ] Desativar `joao` impede o login dele; reativar devolve o acesso, com os dados intactos.
- [ ] O admin não consegue se desativar.
- [ ] A tela de admin não exibe nenhum valor de lançamento de outros usuários.
