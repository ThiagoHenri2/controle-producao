import { CircleUser } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import type { Profile } from '../api';
import { useMeuGerente } from '../hooks';
import { PapelBadge } from './PapelBadge';

/** Cabeçalho de Minha conta: nome, @usuário, papel e o gerente responsável (spec 010). */
export function ContaResumo({ profile }: { profile: Profile }) {
  const gerente = useMeuGerente(profile.id);

  let linhaGerente: string | null = null;
  if (gerente.data) linhaGerente = `Gerente: ${gerente.data.nome}`;
  else if (gerente.isSuccess && profile.role === 'user') linhaGerente = 'Sem gerente';

  return (
    <Card className="flex items-center gap-3">
      <CircleUser className="h-10 w-10 shrink-0 text-slate-400" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-lg font-bold text-slate-900">{profile.nome}</p>
          <PapelBadge role={profile.role} />
        </div>
        <p className="truncate text-sm text-slate-600">@{profile.username}</p>
        {gerente.isPending ? (
          <Skeleton className="mt-0.5 h-4 w-32" />
        ) : (
          linhaGerente && (
            <p className="truncate text-sm text-slate-700" data-testid="conta-gerente">
              {linhaGerente}
            </p>
          )
        )}
      </div>
    </Card>
  );
}
