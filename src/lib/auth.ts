/** Domínio do e-mail sintético. O usuário nunca vê esse e-mail. */
export const AUTH_EMAIL_DOMAIN = 'entregas.local';

/** Converte o nome de usuário no e-mail sintético usado pelo Supabase Auth. */
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

/** Mensagens de login (spec 002). Nunca diga se o erro foi no usuário ou na senha. */
export const AUTH_MESSAGES = {
  invalidCredentials: 'Usuário ou senha inválidos.',
  inactive: 'Usuário desativado. Fale com o administrador.',
  unexpected: 'Não foi possível entrar. Verifique sua conexão e tente de novo.',
} as const;

/** Erro de login com mensagem já pronta para exibir ao usuário. */
export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}
