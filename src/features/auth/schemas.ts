import { z } from 'zod';
import { ADMIN_MESSAGES, passwordSchema } from '@/features/admin/schemas';

export const CONTA_MESSAGES = {
  atualRequired: 'Informe a senha atual.',
  confirmMismatch: ADMIN_MESSAGES.confirmMismatch,
  sameAsCurrent: 'A nova senha precisa ser diferente da atual.',
} as const;

/** Trocar senha (spec 010): nova ≥ 6, confirmação igual e nova ≠ atual. */
export const changePasswordSchema = z
  .object({
    atual: z.string().min(1, CONTA_MESSAGES.atualRequired),
    nova: passwordSchema,
    confirmacao: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.atual && v.nova === v.atual) {
      ctx.addIssue({ code: 'custom', message: CONTA_MESSAGES.sameAsCurrent, path: ['nova'] });
    }
    if (v.confirmacao !== v.nova) {
      ctx.addIssue({
        code: 'custom',
        message: CONTA_MESSAGES.confirmMismatch,
        path: ['confirmacao'],
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
