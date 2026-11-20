import { useAuth } from '@/features/auth/auth-context';
import { useMeuGerente } from '@/features/auth/hooks';
import type { MeuGerente } from '@/features/auth/api';
import type { UsuarioAlvo } from './useUsuarioAlvo';

/**
 * Gerente (não admin)? Ele só enxerga as categorias que cada atendente liberou
 * e nunca as despesas deles (spec 011). O admin não é afetado.
 */
export function useGerenteRestrito(): boolean {
  const { isGerente, isAdmin } = useAuth();
  return isGerente && !isAdmin;
}

export type PermissoesAlvo = {
  /** Gerente (não admin) olhando os dados de um atendente. */
  ehGerenteVendoAtendente: boolean;
  /** Aba/seção de despesas disponível para este alvo? */
  podeVerDespesas: boolean;
  /** Dono com gerente: pode liberar/ocultar suas categorias para ele. */
  podeAlterarVisibilidade: boolean;
  /** Gerente do usuário logado (`meu_gerente`), quando existe. */
  meuGerente: MeuGerente | null;
  /** Nome do atendente alvo ("Eu" quando é o próprio). */
  nomeAlvo: string;
};

/** Regras de privacidade da spec 011 para o alvo atual, centralizadas num lugar só. */
export function usePermissoesAlvo(alvo: UsuarioAlvo): PermissoesAlvo {
  const restrito = useGerenteRestrito();
  const gerente = useMeuGerente(alvo.isEu ? alvo.euId : undefined);
  const meuGerente = alvo.isEu ? (gerente.data ?? null) : null;
  const ehGerenteVendoAtendente = restrito && !alvo.isEu;
  return {
    ehGerenteVendoAtendente,
    podeVerDespesas: !ehGerenteVendoAtendente,
    podeAlterarVisibilidade: alvo.isEu && meuGerente !== null,
    meuGerente,
    nomeAlvo: alvo.alvoNome,
  };
}
