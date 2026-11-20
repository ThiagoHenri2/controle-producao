import { z } from 'zod';
import { ROLES } from '@/features/auth/roles';
import type { ProfileRole } from '@/lib/database.types';

/** Mesmas regras da Edge Function `admin-users` (spec 006). */
export const USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/;
export const PASSWORD_MIN = 6;

export const ADMIN_MESSAGES = {
  nomeRequired: 'Informe o nome.',
  nomeMax: 'Use no máximo 80 caracteres.',
  usernameRequired: 'Informe o usuário.',
  usernameInvalid: 'Use de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _.',
  passwordMin: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`,
  roleInvalid: 'Escolha um papel válido.',
} as const;

/** trim + minúsculas, igual ao backend. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, ADMIN_MESSAGES.usernameRequired)
  .regex(USERNAME_REGEX, ADMIN_MESSAGES.usernameInvalid);

export const passwordSchema = z.string().min(PASSWORD_MIN, ADMIN_MESSAGES.passwordMin);

/** Papel: 'user' (Entregador), 'gerente' ou 'admin' (spec 008). */
export const roleSchema = z.enum(ROLES as readonly [ProfileRole, ...ProfileRole[]], {
  error: ADMIN_MESSAGES.roleInvalid,
});

export const newUserSchema = z.object({
  nome: z.string().trim().min(1, ADMIN_MESSAGES.nomeRequired).max(80, ADMIN_MESSAGES.nomeMax),
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema.default('user'),
});

export type NewUserInput = z.infer<typeof newUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });

/** Converte as issues do Zod em `{ campo: primeira mensagem }`. */
export function fieldErrorsFrom<K extends string>(error: z.ZodError): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in errors)) {
      errors[field as K] = issue.message;
    }
  }
  return errors;
}
