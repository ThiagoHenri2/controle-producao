/**
 * Captura o `beforeinstallprompt` o mais cedo possível (no import do módulo),
 * porque o Chrome pode disparar o evento antes do login, quando o banner
 * ainda não está montado.
 */

/** Evento não padronizado do Chromium (não existe nos tipos do DOM). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallPromptState = {
  deferredEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
};

let state: InstallPromptState = { deferredEvent: null, installed: false };
const listeners = new Set<() => void>();
let listening = false;

function setState(next: Partial<InstallPromptState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  setState({ deferredEvent: event as BeforeInstallPromptEvent });
}

function onAppInstalled() {
  setState({ deferredEvent: null, installed: true });
}

export function startInstallPromptCapture() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallPromptState(): InstallPromptState {
  return state;
}

/** O evento só pode ser usado uma vez; depois do prompt ele é descartado. */
export function consumeInstallPrompt(): BeforeInstallPromptEvent | null {
  const event = state.deferredEvent;
  if (event) setState({ deferredEvent: null });
  return event;
}

export function markInstalled() {
  setState({ deferredEvent: null, installed: true });
}

/** Só para testes. */
export function resetInstallPromptStore() {
  state = { deferredEvent: null, installed: false };
  listeners.forEach((l) => l());
}

startInstallPromptCapture();
