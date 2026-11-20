import { useState } from 'react';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import { BottomSheet, Button, SkeletonList } from '@/components/ui';
import { InativoBadge, PapelBadge } from '@/features/auth/components/PapelBadge';
import { cn } from '@/lib/cn';
import type { Perfil } from '../api';
import type { UsuarioAlvo } from '../useUsuarioAlvo';

type UsuarioAlvoSelectProps = {
  alvo: UsuarioAlvo;
  /** Verbo da faixa: "Você está lançando/vendo como gestor para João". */
  acao: 'lançando' | 'vendo';
  /** Rótulo do botão. Padrão: "Lançando para". */
  rotulo?: string;
};

/**
 * Seletor do entregador alvo (só gestor, spec 008): botão "Lançando para: Eu ▾"
 * que abre um BottomSheet com "Eu" e os perfis ativos. Fora do próprio usuário,
 * o bloco fica em destaque (índigo) com a faixa "Você está … como gestor para …".
 */
export function UsuarioAlvoSelect({
  alvo,
  acao,
  rotulo = 'Lançando para',
}: UsuarioAlvoSelectProps) {
  const [aberto, setAberto] = useState(false);
  if (!alvo.isGestor) return null;

  const outro = !alvo.isEu;
  const nome = alvo.alvoNome;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border',
        outro ? 'border-indigo-300 bg-indigo-50' : 'border-transparent',
      )}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberto(true)}
        className={cn(
          'flex min-h-touch w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
          outro
            ? 'text-indigo-950 hover:bg-indigo-100'
            : 'border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50',
        )}
      >
        <UserRound
          className={cn('h-5 w-5 shrink-0', outro ? 'text-indigo-700' : 'text-slate-500')}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">
          {rotulo}: <strong className="font-bold">{nome}</strong>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </button>

      {outro && (
        <div
          role="status"
          className="flex items-center gap-2 border-t border-indigo-200 py-1 pl-3 pr-1 text-sm text-indigo-950"
        >
          <p className="min-w-0 flex-1">
            Você está {acao} como gestor para <strong className="font-bold">{nome}</strong>
          </p>
          <button
            type="button"
            onClick={() => alvo.setAlvo(alvo.euId)}
            className="min-h-touch shrink-0 rounded-lg px-3 font-semibold text-indigo-900 underline underline-offset-2 hover:bg-indigo-100"
          >
            Voltar para mim
          </button>
        </div>
      )}

      {aberto && (
        <UsuarioAlvoSheet
          alvo={alvo}
          onClose={() => setAberto(false)}
          onEscolher={(id) => {
            alvo.setAlvo(id);
            setAberto(false);
          }}
        />
      )}
    </div>
  );
}

type UsuarioAlvoSheetProps = {
  alvo: UsuarioAlvo;
  onEscolher: (id: string) => void;
  onClose: () => void;
};

function UsuarioAlvoSheet({ alvo, onEscolher, onClose }: UsuarioAlvoSheetProps) {
  const { perfis } = alvo;
  // Perfis ativos (menos eu); um alvo inativo (vindo da Equipe) continua na lista.
  const outros = (perfis.data ?? []).filter(
    (p) => p.id !== alvo.euId && (p.ativo || p.id === alvo.alvoId),
  );

  return (
    <BottomSheet open title="Escolher entregador" onClose={onClose}>
      {perfis.isPending ? (
        <SkeletonList rows={3} label="Carregando entregadores…" />
      ) : perfis.isError ? (
        <div className="flex flex-col gap-3 text-center">
          <p className="text-sm text-slate-700">Não foi possível carregar os entregadores.</p>
          <Button variant="secondary" loading={perfis.isFetching} onClick={() => perfis.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <ul aria-label="Entregadores" className="-mx-2 flex flex-col">
          <Opcao
            nome="Eu"
            detalhe="Meus próprios dados"
            selecionado={alvo.isEu}
            onClick={() => onEscolher(alvo.euId)}
          />
          {outros.map((p) => (
            <Opcao
              key={p.id}
              nome={p.nome}
              perfil={p}
              detalhe={`@${p.username}`}
              selecionado={p.id === alvo.alvoId}
              onClick={() => onEscolher(p.id)}
            />
          ))}
          {outros.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-slate-600">
              Nenhum outro usuário ativo.
            </li>
          )}
        </ul>
      )}
    </BottomSheet>
  );
}

type OpcaoProps = {
  nome: string;
  detalhe: string;
  perfil?: Perfil;
  selecionado: boolean;
  onClick: () => void;
};

function Opcao({ nome, detalhe, perfil, selecionado, onClick }: OpcaoProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={selecionado ? 'true' : undefined}
        className={cn(
          'flex min-h-[56px] w-full items-center gap-3 rounded-lg px-3 py-1 text-left hover:bg-slate-100',
          selecionado && 'bg-indigo-50',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-slate-900">{nome}</span>
          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
            <span className="truncate">{detalhe}</span>
            {perfil && perfil.role !== 'user' && <PapelBadge role={perfil.role} />}
            {perfil && !perfil.ativo && <InativoBadge />}
          </span>
        </span>
        {selecionado && <Check className="h-5 w-5 shrink-0 text-indigo-700" aria-hidden />}
      </button>
    </li>
  );
}
