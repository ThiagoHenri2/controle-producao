import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  consumeInstallPrompt,
  getInstallPromptState,
  markInstalled,
  startInstallPromptCapture,
  subscribeInstallPrompt,
} from './installPromptStore';

export const INSTALL_DISMISS_KEY = 'entregas:install-banner-dismissed-at';
export const DISMISS_DAYS = 30;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

function readDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function saveDismissed() {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage indisponível (modo privado/cota): a dispensa vale só nesta sessão.
  }
}

const STANDALONE_QUERY = '(display-mode: standalone)';

function isStandaloneNow(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia(STANDALONE_QUERY).matches;
}

/** `true` quando o app já roda instalado (tela cheia). */
export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(isStandaloneNow);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(STANDALONE_QUERY);
    if (typeof mql.addEventListener !== 'function') return;
    const onChange = () => setStandalone(isStandaloneNow());
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return standalone;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac; diferencia pelo toque.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export type InstallPrompt = {
  /** Há um `beforeinstallprompt` guardado, o app não está instalado e o banner não foi dispensado. */
  canInstall: boolean;
  /** iOS fora do modo standalone e sem dispensa: mostrar a dica manual. */
  showIOSHint: boolean;
  promptInstall: () => Promise<InstallOutcome>;
  /** "Agora não": esconde e lembra por 30 dias. */
  dismiss: () => void;
};

export function useInstallPrompt(): InstallPrompt {
  startInstallPromptCapture();
  const { deferredEvent, installed } = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPromptState,
    getInstallPromptState,
  );
  const standalone = useIsStandalone();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [ios] = useState(isIOS);

  const hidden = dismissed || installed || standalone;

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const event = consumeInstallPrompt();
    if (!event) return 'unavailable';
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') markInstalled();
    return outcome;
  }, []);

  const dismiss = useCallback(() => {
    saveDismissed();
    setDismissed(true);
  }, []);

  return {
    canInstall: !hidden && deferredEvent !== null,
    showIOSHint: !hidden && ios && deferredEvent === null,
    promptInstall,
    dismiss,
  };
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Acompanha `navigator.onLine` pelos eventos `online`/`offline`. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
