import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { InativoBadge, PapelBadge } from '@/features/auth/components/PapelBadge';
import { formatEntregas, percentual } from '@/features/relatorio/format';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import type { ResumoUsuario } from '../api';
import { ordenarEquipe, semProducao } from '../ordenar';

type EquipeListaProps = {
  usuarios: readonly ResumoUsuario[];
  totalGeral: number;
  /** Destino ao tocar num entregador (relatório dele com o período atual). */
  linkPara: (userId: string) => { pathname: string; search: string };
};

/** Lista por entregador: nome, @usuário, selos, entregas, R$ a pagar e barra %. */
export function EquipeLista({ usuarios, totalGeral, linkPara }: EquipeListaProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-bold text-slate-900">
        Por entregador
      </h2>
      <ul
        aria-labelledby={titleId}
        className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm"
      >
        {ordenarEquipe(usuarios).map((u) => {
          const zero = semProducao(u);
          const pct = percentual(u.valor, totalGeral);
          const entregas = formatEntregas(Number(u.quantidade));
          return (
            <li key={u.user_id} data-testid="equipe-item" className={cn(zero && 'opacity-60')}>
              <Link
                to={linkPara(u.user_id)}
                aria-label={`${u.nome}: ${entregas}, ${formatBRL(u.valor)} a pagar. Ver relatório`}
                className="flex items-center gap-2 py-3 pl-4 pr-2 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:bg-slate-100"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                      {u.nome}
                    </span>
                    <span
                      className="shrink-0 font-semibold tabular-nums text-slate-900"
                      data-testid="equipe-valor"
                    >
                      {formatBRL(u.valor)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
                    <span className="min-w-0 truncate">@{u.username}</span>
                    {u.role !== 'user' && <PapelBadge role={u.role} />}
                    {!u.ativo && <InativoBadge />}
                    <span className="ml-auto shrink-0 tabular-nums">{entregas}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
