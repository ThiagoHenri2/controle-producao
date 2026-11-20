import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav, PageHeader } from '@/components/ui';
import { getNavItems, getPageTitle } from './navigation';

type AppLayoutProps = {
  /** Mostra o item "Usuários" na BottomNav. A spec 002 liga isso ao perfil. */
  isAdmin?: boolean;
  /** Ações do cabeçalho (ponto de encaixe do botão "Sair" da spec 002). */
  headerActions?: ReactNode;
};

/** Cabeçalho compacto + conteúdo em coluna única + BottomNav fixa. */
export function AppLayout({ isAdmin = false, headerActions }: AppLayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title={getPageTitle(pathname)} actions={headerActions} />
      <main
        className="mx-auto w-full max-w-md flex-1 px-4 pt-4"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom) + 1rem)' }}
      >
        <Outlet />
      </main>
      <BottomNav items={getNavItems({ isAdmin })} />
    </div>
  );
}
