import type { ProfileRole } from '@/lib/database.types';

/** Papéis na ordem em que aparecem nos formulários (padrão primeiro). */
export const ROLES: readonly ProfileRole[] = ['user', 'gerente', 'admin'];

/** Rótulo curto do papel (selos e selects). */
export const ROLE_LABELS: Record<ProfileRole, string> = {
  user: 'Entregador',
  gerente: 'Gerente',
  admin: 'Admin',
};

/** Gestor = gerente ou admin (spec 008). */
export function isGestorRole(role: ProfileRole | null | undefined): boolean {
  return role === 'admin' || role === 'gerente';
}
