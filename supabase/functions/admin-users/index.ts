// =====================================================================
// Edge Function: admin-users
// Spec 006 — Administração de usuários; spec 008 — papel gerente
//
// Endpoint único POST { action, ... }:
//   create          { nome, username, password, role? }   role: "user" (padrão) | "gerente" | "admin"
//   reset_password  { user_id, password }
//   set_active      { user_id, ativo }
//   set_role        { user_id, role }                     role: "user" | "gerente" | "admin"
//
// Só o ADMIN ativo usa esta função (o gerente NÃO gerencia usuários: 403).
// O admin não pode rebaixar a si mesmo (para "user" ou "gerente") nem se desativar.
//
// Respostas: 200 { ok: true, user? } | 4xx/5xx { error } (mensagens pt-BR)
//
// Arquivo AUTOCONTIDO (sem imports relativos): pode ser colado no editor de
// Edge Functions do painel do Supabase ou publicado com
// `npx supabase functions deploy admin-users`.
// Requer "Verify JWT" ligado (padrão). A service_role só existe aqui.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_DOMAIN = "entregas.local";
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h"; // ~100 anos
const PROFILE_COLUMNS = "id, username, nome, role, ativo";

const ROLES = ["user", "gerente", "admin"] as const;
type Role = (typeof ROLES)[number];

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

interface ProfileDTO {
  id: string;
  username: string;
  nome: string;
  role: Role;
  ativo: boolean;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function bad(message: string): never {
  throw new HttpError(400, message);
}

// ---------------------------------------------------------------------
// Validação de payload
// ---------------------------------------------------------------------

function requireString(body: Record<string, unknown>, key: string, label: string): string {
  const v = body[key];
  if (typeof v !== "string") bad(`Campo "${label}" é obrigatório.`);
  return v;
}

function parseUsername(body: Record<string, unknown>): string {
  const username = requireString(body, "username", "usuário").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    bad(
      "Usuário inválido: use de 3 a 30 caracteres entre letras minúsculas, números, ponto, hífen ou sublinhado.",
    );
  }
  return username;
}

function parsePassword(body: Record<string, unknown>): string {
  const password = requireString(body, "password", "senha");
  if (password.length < 6) bad("A senha deve ter no mínimo 6 caracteres.");
  if (password.length > 72) bad("A senha deve ter no máximo 72 caracteres.");
  return password;
}

function parseNome(body: Record<string, unknown>): string {
  const nome = requireString(body, "nome", "nome").trim();
  if (nome.length < 1 || nome.length > 80) {
    bad("O nome deve ter entre 1 e 80 caracteres.");
  }
  return nome;
}

function parseUserId(body: Record<string, unknown>): string {
  const id = requireString(body, "user_id", "user_id").trim();
  if (!UUID_RE.test(id)) bad("Identificador de usuário inválido.");
  return id.toLowerCase();
}

function parseAtivo(body: Record<string, unknown>): boolean {
  const v = body["ativo"];
  if (typeof v !== "boolean") bad('Campo "ativo" deve ser true ou false.');
  return v;
}

const ROLE_ERROR = 'Campo "role" deve ser "user", "gerente" ou "admin".';

function parseRole(body: Record<string, unknown>): Role {
  const v = body["role"];
  if (!isRole(v)) bad(ROLE_ERROR);
  return v;
}

/** role opcional (create): ausente/null => "user". */
function parseOptionalRole(body: Record<string, unknown>): Role {
  const v = body["role"];
  if (v === undefined || v === null) return "user";
  if (!isRole(v)) bad(ROLE_ERROR);
  return v;
}

function isEmailExistsError(err: { message?: string; code?: string; status?: number }): boolean {
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "email_exists" ||
    err.code === "user_already_exists" ||
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("already exists")
  );
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Método não permitido" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("admin-users: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
      return json(500, { error: "Erro interno" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // 1. Autenticação: Bearer <jwt>
    const authHeader = req.headers.get("Authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) return json(401, { error: "Não autenticado" });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json(401, { error: "Sessão inválida ou expirada" });
    }
    const callerId = userData.user.id;

    // 2. Autorização: precisa ser admin ativo (gerente => 403)
    const { data: callerProfile, error: callerErr } = await admin
      .from("profiles")
      .select("role, ativo")
      .eq("id", callerId)
      .maybeSingle();
    if (callerErr) throw callerErr;
    if (!callerProfile || callerProfile.role !== "admin" || callerProfile.ativo !== true) {
      return json(403, { error: "Acesso negado" });
    }

    // 3. Payload
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json(400, { error: "Corpo da requisição inválido." });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: "Corpo da requisição inválido (JSON esperado)." });
    }

    const action = body["action"];

    // Busca o profile-alvo (404 se não existir)
    const loadTarget = async (id: string): Promise<ProfileDTO> => {
      const { data, error } = await admin
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Usuário não encontrado.");
      return data as ProfileDTO;
    };

    switch (action) {
      // -------------------------------------------------------------
      case "create": {
        const nome = parseNome(body);
        const username = parseUsername(body);
        const password = parsePassword(body);
        const role = parseOptionalRole(body);

        const { data: existing, error: existErr } = await admin
          .from("profiles")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (existErr) throw existErr;
        if (existing) return json(409, { error: "Usuário já existe" });

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: `${username}@${EMAIL_DOMAIN}`,
          password,
          email_confirm: true,
          user_metadata: { username, nome },
        });
        if (createErr || !created?.user) {
          if (createErr && isEmailExistsError(createErr)) {
            return json(409, { error: "Usuário já existe" });
          }
          if (createErr && createErr.code === "weak_password") {
            return json(400, { error: "Senha recusada pelo servidor de autenticação." });
          }
          throw createErr ?? new Error("createUser sem retorno");
        }
        const newId = created.user.id;

        const { data: profile, error: insertErr } = await admin
          .from("profiles")
          .insert({ id: newId, username, nome, role, ativo: true })
          .select(PROFILE_COLUMNS)
          .single();
        if (insertErr || !profile) {
          // Rollback manual: remove o auth user órfão.
          const { error: delErr } = await admin.auth.admin.deleteUser(newId);
          if (delErr) {
            console.error("admin-users: falha no rollback do auth user", newId, delErr);
          }
          if (insertErr?.code === "23505") {
            return json(409, { error: "Usuário já existe" });
          }
          throw insertErr ?? new Error("insert profile sem retorno");
        }

        return json(200, { ok: true, user: profile as ProfileDTO });
      }

      // -------------------------------------------------------------
      case "reset_password": {
        const userId = parseUserId(body);
        const password = parsePassword(body);
        const target = await loadTarget(userId);

        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) {
          if (error.code === "weak_password") {
            return json(400, { error: "Senha recusada pelo servidor de autenticação." });
          }
          throw error;
        }
        return json(200, { ok: true, user: target });
      }

      // -------------------------------------------------------------
      case "set_active": {
        const userId = parseUserId(body);
        const ativo = parseAtivo(body);
        if (!ativo && userId === callerId) {
          return json(400, { error: "Você não pode desativar a si mesmo." });
        }
        await loadTarget(userId);

        // Ban/unban primeiro: se falhar, o profile não muda.
        const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: ativo ? "none" : BAN_FOREVER,
        });
        if (banErr) throw banErr;

        const { data: profile, error: updErr } = await admin
          .from("profiles")
          .update({ ativo })
          .eq("id", userId)
          .select(PROFILE_COLUMNS)
          .single();
        if (updErr || !profile) {
          // Desfaz o ban/unban para manter auth e profile coerentes.
          await admin.auth.admin.updateUserById(userId, {
            ban_duration: ativo ? BAN_FOREVER : "none",
          }).catch((e) => console.error("admin-users: falha ao desfazer ban", userId, e));
          throw updErr ?? new Error("update profile sem retorno");
        }
        return json(200, { ok: true, user: profile as ProfileDTO });
      }

      // -------------------------------------------------------------
      case "set_role": {
        const userId = parseUserId(body);
        const role = parseRole(body);
        // Vale para "user" E "gerente": o admin não se rebaixa.
        if (role !== "admin" && userId === callerId) {
          return json(400, { error: "Você não pode remover seu próprio acesso de administrador." });
        }
        await loadTarget(userId);

        const { data: profile, error: updErr } = await admin
          .from("profiles")
          .update({ role })
          .eq("id", userId)
          .select(PROFILE_COLUMNS)
          .single();
        if (updErr || !profile) throw updErr ?? new Error("update profile sem retorno");
        return json(200, { ok: true, user: profile as ProfileDTO });
      }

      // -------------------------------------------------------------
      default:
        return json(400, {
          error: typeof action === "string" && action.length > 0
            ? `Ação desconhecida: ${action.slice(0, 40)}`
            : 'Campo "action" é obrigatório.',
        });
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.status, { error: err.message });
    }
    console.error("admin-users: erro inesperado", err);
    return json(500, { error: "Erro interno" });
  }
});
