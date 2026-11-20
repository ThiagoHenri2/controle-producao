import { PlusCircle, BarChart3, Tags, Users } from 'lucide-react';
import type { BottomNavItem } from '@/components/ui';

export const ROUTES = {
  login: '/login',
  lancar: '/',
  relatorio: '/relatorio',
  categorias: '/categorias',
  usuarios: '/admin/usuarios',
} as const;

const baseItems: BottomNavItem[] = [
  { to: ROUTES.lancar, label: 'Lançar', icon: PlusCircle, end: true },
  { to: ROUTES.relatorio, label: 'Relatório', icon: BarChart3 },
  { to: ROUTES.categorias, label: 'Categorias', icon: Tags },
];

const adminItem: BottomNavItem = { to: ROUTES.usuarios, label: 'Usuários', icon: Users };

export function getNavItems({ isAdmin }: { isAdmin: boolean }): BottomNavItem[] {
  return isAdmin ? [...baseItems, adminItem] : baseItems;
}

const titles: Record<string, string> = {
  [ROUTES.lancar]: 'Lançar',
  [ROUTES.relatorio]: 'Relatório',
  [ROUTES.categorias]: 'Categorias',
  [ROUTES.usuarios]: 'Usuários',
};

/** Título exibido no PageHeader para o caminho atual. */
export function getPageTitle(pathname: string): string {
  return titles[pathname] ?? 'Controle de Entregas';
}
