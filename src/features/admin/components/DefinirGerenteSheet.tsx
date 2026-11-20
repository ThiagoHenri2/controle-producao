import { useState } from 'react';
import { Check } from 'lucide-react';
import { Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AdminUser } from '../api';
import { useSetUserGerente } from '../hooks';
import { AdminFormAlert } from './AdminFormAlert';
import { AdminSheet } from './AdminSheet';

type DefinirGerenteSheetProps = {
  /** Atendente (role 'user') que receberá o gerente. */
  user: AdminUser;
  /** Gerentes ativos. */
  gerentes: readonly AdminUser[];
  onClose: () => void;
};

/**
 * "Definir gerente…" (spec 010): lista os gerentes ativos + "Nenhum". Tocar
 * numa opção já salva (`set_gerente`); a atual fica marcada.
 */
export function DefinirGerenteSheet({ user, gerentes, onClose }: DefinirGerenteSheetProps) {
  const toast = useToast();
  const setGerente = useSetUserGerente();
  const [escolhido, setEscolhido] = useState<string | null | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const pending = setGerente.isPending;

  function escolher(gerenteId: string | null) {
    if (pending) return;
    if (gerenteId === user.gerente_id) {
      onClose();
      return;
    }
    setFormError(null);
    setEscolhido(gerenteId);
    setGerente.mutate(
      { userId: user.id, gerenteId },
      {
        onSuccess: () => {
          const nome = gerentes.find((g) => g.id === gerenteId)?.nome;
          toast.success(
            nome ? `${user.nome} agora é atendente de ${nome}.` : `${user.nome} ficou sem gerente.`,
          );
          onClose();
        },
        onError: (err) => setFormError(err.message),
      },
    );
  }

  const opcoes: { id: string | null; nome: string; detalhe?: string }[] = [
    ...gerentes.map((g) => ({ id: g.id, nome: g.nome, detalhe: `@${g.username}` })),
    { id: null, nome: 'Nenhum', detalhe: 'Sem gerente responsável' },
  ];

  return (
    <AdminSheet
      open
      title="Definir gerente"
      description={`${user.nome} · @${user.username}`}
      busy={pending}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {gerentes.length === 0 && (
          <p className="text-sm text-slate-600">
            Nenhum gerente ativo. Torne alguém gerente para vincular atendentes.
          </p>
        )}
        <ul aria-label="Gerentes" className="-mx-2 flex flex-col">
          {opcoes.map((o) => {
            const atual = o.id === user.gerente_id;
            const salvando = pending && escolhido === o.id;
            return (
              <li key={o.id ?? 'nenhum'}>
                <button
                  type="button"
                  onClick={() => escolher(o.id)}
                  disabled={pending}
                  aria-current={atual ? 'true' : undefined}
                  aria-busy={salvando || undefined}
                  className={cn(
                    'flex min-h-[56px] w-full items-center gap-3 rounded-lg px-3 py-1 text-left hover:bg-slate-100 disabled:cursor-not-allowed',
                    atual && 'bg-indigo-50',
                    pending && !salvando && 'opacity-60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-slate-900">
                      {o.nome}
                    </span>
                    {o.detalhe && (
                      <span className="block truncate text-sm text-slate-600">{o.detalhe}</span>
                    )}
                  </span>
                  {salvando ? (
                    <Spinner className="h-5 w-5 shrink-0 text-indigo-700" />
                  ) : (
                    atual && <Check className="h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {formError && <AdminFormAlert message={formError} />}
      </div>
    </AdminSheet>
  );
}
