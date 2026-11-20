import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { CATS_PARAM, DCATS_PARAM, toSearchString } from '@/features/relatorio/filtroCategorias';
import type { Perfil } from './api';
import { usePerfis } from './hooks';

/** Parâmetro da URL com o atendente escolhido pelo gestor (spec 008). */
export const USUARIO_PARAM = 'usuario';

export type UsuarioAlvo = {
  /** Id do usuário logado. */
  euId: string;
  /** Dono dos dados exibidos/lançados: o próprio ou o atendente escolhido pelo gestor. */
  alvoId: string;
  isEu: boolean;
  isGestor: boolean;
  /** Perfil do alvo quando ≠ eu (`null` enquanto a lista carrega). */
  alvoPerfil: Perfil | null;
  /** Nome para exibir: "Eu" ou o nome do atendente. */
  alvoNome: string;
  /** `p_usuario` das RPCs: `null` quando é o próprio usuário. */
  pUsuario: string | null;
  /** Perfis que o gestor pode escolher (vazio para atendente). */
  perfis: ReturnType<typeof usePerfis>;
  /** Troca o alvo na URL (replace). Limpa `cats` e `dcats`, que são IDs de outro usuário. */
  setAlvo: (id: string) => void;
  /** Query string `?usuario=<id>` para levar o alvo a outra tela ('' quando é o próprio). */
  search: string;
};

/**
 * Atendente alvo das telas Lançar, Categorias e Relatório, lido de `?usuario=`.
 * - Para quem não é gestor, sempre devolve o próprio id e ignora o parâmetro.
 * - Para o gestor, um id que não está na lista de perfis (já carregada) cai para "eu".
 */
export function useUsuarioAlvo(): UsuarioAlvo {
  const { profile, session, isGestor } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const perfis = usePerfis({ enabled: isGestor });
  const euId = profile?.id ?? session?.user.id ?? '';

  const param = isGestor ? searchParams.get(USUARIO_PARAM)?.trim() || null : null;
  const lista = perfis.data;
  const desconhecido = Boolean(param && lista && !lista.some((p) => p.id === param));
  const alvoId = param && !desconhecido ? param : euId;
  const isEu = alvoId === euId;
  const alvoPerfil = useMemo(
    () => (isEu ? null : (lista?.find((p) => p.id === alvoId) ?? null)),
    [isEu, lista, alvoId],
  );

  const setAlvo = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      if (!id || id === euId) next.delete(USUARIO_PARAM);
      else next.set(USUARIO_PARAM, id);
      next.delete(CATS_PARAM);
      next.delete(DCATS_PARAM);
      navigate({ search: toSearchString(next) }, { replace: true });
    },
    [searchParams, euId, navigate],
  );

  return {
    euId,
    alvoId,
    isEu,
    isGestor,
    alvoPerfil,
    alvoNome: isEu ? 'Eu' : (alvoPerfil?.nome ?? 'Atendente'),
    pUsuario: isEu ? null : alvoId,
    perfis,
    setAlvo,
    search: isEu ? '' : `?${new URLSearchParams({ [USUARIO_PARAM]: alvoId }).toString()}`,
  };
}
