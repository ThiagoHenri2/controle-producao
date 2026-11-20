import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MoreVertical } from 'lucide-react';
import { InativoBadge, PapelBadge } from '@/features/auth/components/PapelBadge';
import { formatEntregas, formatLancamentos, percentual } from '@/features/relatorio/format';
import type { TipoRelatorio } from '@/features/relatorio/tipo';
import { cn } from '@/lib/cn';
import { formatBRL, fromCentavos } from '@/lib/format';
import type { LinhaEquipe } from '../ordenar';

type EquipeListaProps = {
  tipo: TipoRelatorio;
  /** Já ordenadas (`combinarEquipe`). */
  linhas: readonly LinhaEquipe[];
  /** Total do tipo (para a barra %), em reais. Ignorado em "Ambos". */
  totalGeral: number;
  /** Destino ao tocar num atendente (relatório dele com o período e o tipo atuais). */
  linkPara: (userId: string) => { pathname: string; search: string };
  /** Linhas com menu ⋮ (ex.: "Redefinir senha", spec 010). Ausente = nenhuma. */
  temAcoes?: (linha: LinhaEquipe) => boolean;
  onAcoes?: (linha: LinhaEquipe) => void;
};

/**
 * Lista por atendente: nome, @usuário, selos e o valor do tipo
 * (Receitas: R$ a pagar e entregas; Despesas: R$ e lançamentos; Ambos: saldo,
 * com receitas e despesas abaixo).
 */
export function EquipeLista({
  tipo,
  linhas,
  totalGeral,
  linkPara,
  temAcoes,
  onAcoes,
}: EquipeListaProps) {
  const titleId = useId();
  const acoesEm = (u: LinhaEquipe) => Boolean(temAcoes?.(u) && onAcoes);
  // Mantém os valores alinhados quando só algumas linhas têm o ⋮.
  const algumaComAcoes = linhas.some(acoesEm);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-bold text-slate-900">
        Por atendente
      </h2>
      <ul
        aria-labelledby={titleId}
        className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface shadow-sm"
      >
        {linhas.map((u) => {
          const receitas = formatBRL(fromCentavos(u.receitas));
          const despesas = formatBRL(fromCentavos(u.despesas));
          const saldo = formatBRL(fromCentavos(u.saldo));
          let valor: string;
          let detalhe: string;
          let rotulo: string;
          let pct: number | null;
          if (tipo === 'receitas') {
            valor = receitas;
            detalhe = formatEntregas(u.entregas);
            rotulo = `${u.nome}: ${detalhe}, ${valor} a pagar. Ver relatório`;
            pct = percentual(fromCentavos(u.receitas), totalGeral);
          } else if (tipo === 'despesas') {
            valor = despesas;
            detalhe = formatLancamentos(u.despesasQtd);
            rotulo = `${u.nome}: ${detalhe}, ${valor} de despesas. Ver relatório`;
            pct = percentual(fromCentavos(u.despesas), totalGeral);
          } else {
            valor = saldo;
            detalhe = `+${receitas} · −${despesas}`;
            rotulo = `${u.nome}: receitas ${receitas}, despesas ${despesas}, saldo ${saldo}. Ver relatório`;
            pct = null;
          }
          return (
            <li
              key={u.user_id}
              data-testid="equipe-item"
              className={cn('flex items-center', u.zero && 'opacity-60')}
            >
              <Link
                to={linkPara(u.user_id)}
                aria-label={rotulo}
                className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4 pr-2 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:bg-slate-100"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                      {u.nome}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-semibold tabular-nums',
                        tipo === 'despesas' || (tipo === 'ambos' && u.saldo < 0)
                          ? 'text-red-700'
                          : 'text-slate-900',
                      )}
                      data-testid="equipe-valor"
                    >
                      {valor}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
                    <span className="min-w-0 truncate">@{u.username}</span>
                    {u.role !== 'user' && <PapelBadge role={u.role} />}
                    {!u.ativo && <InativoBadge />}
                    {tipo === 'ambos' ? (
                      <span className="ml-auto shrink-0 tabular-nums" data-testid="equipe-detalhe">
                        <span className="text-green-700">+{receitas}</span>
                        <span aria-hidden> · </span>
                        <span className="text-red-700">−{despesas}</span>
                      </span>
                    ) : (
                      <span className="ml-auto shrink-0 tabular-nums">{detalhe}</span>
                    )}
                  </div>
                  {pct !== null && (
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                      aria-hidden
                    >
                      <div
                        className={cn(
                          'h-full rounded-full',
                          tipo === 'despesas' ? 'bg-danger' : 'bg-primary',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </Link>
              {acoesEm(u) ? (
                <button
                  type="button"
                  onClick={() => onAcoes?.(u)}
                  aria-label={`Ações de ${u.nome}`}
                  aria-haspopup="dialog"
                  className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <MoreVertical className="h-5 w-5" aria-hidden />
                </button>
              ) : (
                algumaComAcoes && <span className="mr-1 w-11 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
