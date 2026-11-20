import { PlusCircle, BarChart3, Tags, Users, Wallet } from 'lucide-react';
import type { BottomNavItem } from '@/components/ui';

export const ROUTES = {
  login: '/login',
  lancar: '/',
  relatorio: '/relatorio',
  categorias: '/categorias',
  equipe: '/equipe',
  usuarios: '/admin/usuarios',
  conta: '/conta',
} as const;

const baseItems: BottomNavItem[] = [
  { to: ROUTES.lancar, label: 'Lançar', icon: PlusCircle, end: true },
  { to: ROUTES.relatorio, label: 'Relatório', icon: BarChart3 },
  { to: ROUTES.categorias, label: 'Categorias', icon: Tags },
];

const equipeItem: BottomNavItem = { to: ROUTES.equipe, label: 'Equipe', icon: Wallet };
const adminItem: BottomNavItem = { to: ROUTES.usuarios, label: 'Usuários', icon: Users };

/**
 * Itens da BottomNav por papel (spec 008):
 * atendente: Lançar · Relatório · Categorias; gerente: + Equipe; admin: + Equipe + Usuários.
 */
export function getNavItems({
  isAdmin,
  isGestor = isAdmin,
}: {
  isAdmin: boolean;
  isGestor?: boolean;
}): BottomNavItem[] {
  const items = [...baseItems];
  if (isGestor || isAdmin) items.push(equipeItem);
  if (isAdmin) items.push(adminItem);
  return items;
}

const titles: Record<string, string> = {
  [ROUTES.lancar]: 'Lançar',
  [ROUTES.relatorio]: 'Relatório',
  [ROUTES.categorias]: 'Categorias',
  [ROUTES.equipe]: 'Equipe',
  [ROUTES.usuarios]: 'Usuários',
  [ROUTES.conta]: 'Minha conta',
};

/** Título exibido no PageHeader para o caminho atual. */
export function getPageTitle(pathname: string): string {
  return titles[pathname] ?? 'Controle de Entregas';
}
