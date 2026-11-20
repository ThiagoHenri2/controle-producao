import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useInstallPrompt } from './hooks';

/** Convite compacto para instalar o PWA. Fica no topo do conteúdo, abaixo do header. */
export function InstallBanner() {
  const { canInstall, showIOSHint, promptInstall, dismiss } = useInstallPrompt();
  const [prompting, setPrompting] = useState(false);

  async function handleInstall() {
    setPrompting(true);
    try {
      await promptInstall();
    } finally {
      setPrompting(false);
    }
  }

  if (canInstall || prompting) {
    return (
      <section
        aria-label="Instalar aplicativo"
        className="mb-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft p-3"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          Instale o app no seu celular
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleInstall} loading={prompting}>
            Instalar
          </Button>
          <Button className="flex-1" variant="secondary" onClick={dismiss} disabled={prompting}>
            Agora não
          </Button>
        </div>
      </section>
    );
  }

  if (showIOSHint) {
    return (
      <section
        aria-label="Instalar aplicativo"
        className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft py-1 pl-3 pr-1"
      >
        <Share className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-sm text-slate-900">
          Para instalar, toque em <strong>Compartilhar</strong> →{' '}
          <strong>Adicionar à Tela de Início</strong>
        </p>
        <Button
          size="icon"
          variant="ghost"
          onClick={dismiss}
          aria-label="Dispensar dica de instalação"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </section>
    );
  }

  return null;
}
