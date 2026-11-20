import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export type BottomNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Casa só com o caminho exato (necessário para "/"). */
  end?: boolean;
};

type BottomNavProps = { items: BottomNavItem[] };

/** Barra de navegação inferior fixa (h-16 + safe area). */
export function BottomNav({ items }: BottomNavProps) {
  // Com 5 itens em 360px cada um tem ~72px: rótulo um pouco mais compacto.
  const compacto = items.length >= 5;
  return (
    <nav
      aria-label="Navegação principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-full min-h-touch flex-col items-center justify-center gap-0.5 px-0.5 font-medium',
                  compacto ? 'text-[11px] tracking-tight' : 'text-xs',
                  isActive ? 'text-primary' : 'text-slate-600 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 items-center justify-center rounded-full',
                      compacto ? 'w-11' : 'w-12',
                      isActive && 'bg-primary-soft',
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span className="max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
