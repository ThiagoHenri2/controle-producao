import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOnlineStatus } from './hooks';

type OfflineBannerProps = {
  /**
   * `below-header`: gruda logo abaixo do PageHeader (telas logadas).
   * `top`: gruda no topo da tela (Login, que não tem header).
   */
  placement?: 'below-header' | 'top';
};

/** Faixa de alerta quando o aparelho está sem internet. */
export function OfflineBanner({ placement = 'below-header' }: OfflineBannerProps) {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className={cn(
        // amber-100 de fundo + amber-900 no texto: contraste ~9:1 (AA).
        'sticky z-10 w-full border-b border-amber-300 bg-amber-100 text-amber-900',
        placement === 'top' && 'pt-safe',
      )}
      style={{
        top: placement === 'below-header' ? 'calc(3.5rem + env(safe-area-inset-top))' : 0,
      }}
    >
      <p className="mx-auto flex max-w-md items-center gap-2 px-4 py-2 text-sm font-semibold">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        Sem conexão — os lançamentos não serão salvos
      </p>
    </div>
  );
}
