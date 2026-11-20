import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type TabItem<T extends string> = { value: T; label: string; icon?: LucideIcon };

export type TabsProps<T extends string> = {
  /** Nome acessível da lista de abas (ex.: "Tipo de lançamento"). */
  label: string;
  /** Prefixo dos ids (`<idBase>-tab-<value>` e `<idBase>-panel-<value>`). Único na tela. */
  idBase: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`;
const tabPanelId = (idBase: string, value: string) => `${idBase}-panel-${value}`;

/**
 * Abas acessíveis (`role="tablist"`, padrão WAI-ARIA com ativação automática):
 * ←/→ trocam de aba, Home/End vão às pontas, só a aba ativa entra no Tab.
 * Cada aba tem ≥ 44px de altura e divide a largura igualmente (cabe em 360px).
 * Use com `TabPanel` (mesmo `idBase`) para ligar a aba ao conteúdo.
 */
export function Tabs<T extends string>({
  label,
  idBase,
  items,
  value,
  onChange,
  className,
}: TabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const atual = items.findIndex((i) => i.value === value);
    let proximo: number;
    switch (event.key) {
      case 'ArrowRight':
        proximo = (atual + 1) % items.length;
        break;
      case 'ArrowLeft':
        proximo = (atual - 1 + items.length) % items.length;
        break;
      case 'Home':
        proximo = 0;
        break;
      case 'End':
        proximo = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const alvo = items[proximo].value;
    onChange(alvo);
    refs.current.get(alvo)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex gap-1 rounded-xl bg-slate-100 p-1', className)}
    >
      {items.map(({ value: v, label: rotulo, icon: Icon }) => {
        const selecionada = v === value;
        return (
          <button
            key={v}
            ref={(el) => {
              if (el) refs.current.set(v, el);
              else refs.current.delete(v);
            }}
            type="button"
            role="tab"
            id={tabId(idBase, v)}
            aria-selected={selecionada}
            aria-controls={tabPanelId(idBase, v)}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => onChange(v)}
            className={cn(
              'flex min-h-touch min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              selecionada
                ? 'bg-surface text-primary shadow-sm'
                : 'text-slate-700 hover:bg-slate-200 active:bg-slate-300',
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="truncate">{rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}

export type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
  idBase: string;
  value: string;
  children: ReactNode;
};

/** Conteúdo da aba ativa (renderize só o da aba selecionada). */
export function TabPanel({ idBase, value, children, className, ...rest }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idBase, value)}
      aria-labelledby={tabId(idBase, value)}
      className={className}
      {...rest}
    >
      {children}
    </div>
  );
}
