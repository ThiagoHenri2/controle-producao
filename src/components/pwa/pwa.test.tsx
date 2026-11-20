import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_DISMISS_KEY } from './hooks';
import { InstallBanner } from './InstallBanner';
import { resetInstallPromptStore } from './installPromptStore';
import { OfflineBanner } from './OfflineBanner';

function mockMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: standalone && query.includes('standalone'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, {
    platforms: ['web'],
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

describe('InstallBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetInstallPromptStore();
    mockMatchMedia(false);
  });

  it('não aparece sem o beforeinstallprompt', () => {
    render(<InstallBanner />);
    expect(screen.queryByText('Instale o app no seu celular')).not.toBeInTheDocument();
  });

  it('aparece após o beforeinstallprompt e "Instalar" chama prompt()', async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    const { event, prompt } = fireBeforeInstallPrompt('accepted');

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Instale o app no seu celular')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Instalar' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Instale o app no seu celular')).not.toBeInTheDocument();
  });

  it('captura o evento mesmo se ele chegar antes de o banner montar', () => {
    fireBeforeInstallPrompt();
    render(<InstallBanner />);
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument();
  });

  it('"Agora não" esconde e persiste a dispensa', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InstallBanner />);
    fireBeforeInstallPrompt();

    await user.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText('Instale o app no seu celular')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_DISMISS_KEY)).not.toBeNull();

    unmount();
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.queryByText('Instale o app no seu celular')).not.toBeInTheDocument();
  });

  it('volta a aparecer depois de 30 dias da dispensa', () => {
    const trintaEUmDias = 31 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() - trintaEUmDias));
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.getByText('Instale o app no seu celular')).toBeInTheDocument();
  });

  it('não aparece quando o app já roda em standalone', () => {
    mockMatchMedia(true);
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.queryByText('Instale o app no seu celular')).not.toBeInTheDocument();
  });

  it('some após o evento appinstalled', () => {
    render(<InstallBanner />);
    fireBeforeInstallPrompt();
    expect(screen.getByText('Instale o app no seu celular')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByText('Instale o app no seu celular')).not.toBeInTheDocument();
  });

  describe('iOS', () => {
    let uaSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      uaSpy = vi
        .spyOn(window.navigator, 'userAgent', 'get')
        .mockReturnValue(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
        );
    });
    afterEach(() => uaSpy.mockRestore());

    it('mostra a dica manual e permite dispensar', async () => {
      const user = userEvent.setup();
      render(<InstallBanner />);
      expect(screen.getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Dispensar dica de instalação' }));
      expect(screen.queryByText(/Adicionar à Tela de Início/)).not.toBeInTheDocument();
      expect(window.localStorage.getItem(INSTALL_DISMISS_KEY)).not.toBeNull();
    });

    it('não mostra a dica em standalone', () => {
      mockMatchMedia(true);
      render(<InstallBanner />);
      expect(screen.queryByText(/Adicionar à Tela de Início/)).not.toBeInTheDocument();
    });
  });
});

describe('OfflineBanner', () => {
  afterEach(() => setOnLine(true));

  it('aparece com offline e some com online', () => {
    setOnLine(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sem conexão — os lançamentos não serão salvos',
    );

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('já aparece se o app abrir sem conexão', () => {
    setOnLine(false);
    render(<OfflineBanner placement="top" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
