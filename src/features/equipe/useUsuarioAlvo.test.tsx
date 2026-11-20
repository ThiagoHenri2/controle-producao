import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { createQueryClient } from '@/lib/queryClient';
import type { Profile } from '@/features/auth/api';
import { fakeSupabase, makeProfile } from '@/test/supabaseMock';
import { useUsuarioAlvo } from './useUsuarioAlvo';

vi.mock('@/lib/supabase', async () => ({
  supabase: (await import('@/test/supabaseMock')).fakeSupabase.client,
}));

const JOAO = makeProfile({ id: 'u-joao', nome: 'João', username: 'joao' });
const ANA = makeProfile({ id: 'u-ana', nome: 'Ana', username: 'ana' });
const MARIA = makeProfile({ id: 'u-maria', nome: 'Maria', username: 'maria', role: 'gerente' });

function authFor(profile: Profile): AuthContextValue {
  const isGestor = profile.role !== 'user';
  return {
    session: null,
    profile,
    isAuthenticated: true,
    role: profile.role,
    isAdmin: profile.role === 'admin',
    isGerente: profile.role === 'gerente',
    isGestor,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function render(profile: Profile, url: string) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authFor(profile)}>
        <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return renderHook(
    () => {
      const alvo = useUsuarioAlvo();
      const { search } = useLocation();
      return { alvo, search };
    },
    { wrapper },
  );
}

describe('useUsuarioAlvo', () => {
  beforeEach(() => {
    fakeSupabase.reset();
    fakeSupabase.addProfiles(JOAO, ANA, MARIA);
  });

  it('atendente: ignora ?usuario e não lista perfis', () => {
    const { result } = render(JOAO, '/relatorio?usuario=u-ana');
    expect(result.current.alvo).toMatchObject({
      alvoId: 'u-joao',
      euId: 'u-joao',
      isEu: true,
      isGestor: false,
      pUsuario: null,
      search: '',
    });
    expect(fakeSupabase.from).not.toHaveBeenCalled();
  });

  it('gestor: usa ?usuario e manda p_usuario', async () => {
    const { result } = render(MARIA, '/relatorio?usuario=u-joao');
    expect(result.current.alvo).toMatchObject({
      alvoId: 'u-joao',
      isEu: false,
      pUsuario: 'u-joao',
      search: '?usuario=u-joao',
    });
    await waitFor(() => expect(result.current.alvo.alvoNome).toBe('João'));
  });

  it('gestor: id desconhecido cai para "eu" depois de carregar os perfis', async () => {
    const { result } = render(MARIA, '/?usuario=nao-existe');
    await waitFor(() => expect(result.current.alvo.alvoId).toBe('u-maria'));
    expect(result.current.alvo.pUsuario).toBeNull();
  });

  it('setAlvo grava ?usuario, limpa cats e preserva o período; "eu" remove o parâmetro', async () => {
    const { result } = render(MARIA, '/relatorio?periodo=semana&cats=c1,c2');
    act(() => result.current.alvo.setAlvo('u-ana'));
    expect(result.current.search).toBe('?periodo=semana&usuario=u-ana');
    expect(result.current.alvo.alvoId).toBe('u-ana');
    act(() => result.current.alvo.setAlvo('u-maria'));
    expect(result.current.search).toBe('?periodo=semana');
    expect(result.current.alvo.isEu).toBe(true);
  });

  it('setAlvo limpa cats e dcats (spec 009) e preserva tipo e aba', () => {
    const { result } = render(
      MARIA,
      '/relatorio?periodo=mes&tipo=ambos&cats=c1&dcats=d1&aba=despesas',
    );
    act(() => result.current.alvo.setAlvo('u-joao'));
    expect(result.current.search).toBe('?periodo=mes&tipo=ambos&aba=despesas&usuario=u-joao');
  });
});
