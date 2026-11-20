import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

export type SupabaseEnvName = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY';

export type SupabaseConfig =
  | { ok: true; url: string; anonKey: string }
  | { ok: false; missing: SupabaseEnvName[]; invalid: SupabaseEnvName[] };

type EnvLike = Partial<Record<SupabaseEnvName, string | undefined>>;

/** Lê e valida as variáveis do Supabase. Função pura (testável). */
export function readSupabaseConfig(env: EnvLike): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const missing: SupabaseEnvName[] = [];
  const invalid: SupabaseEnvName[] = [];

  if (!url) missing.push('VITE_SUPABASE_URL');
  else if (!/^https?:\/\/\S+$/.test(url)) invalid.push('VITE_SUPABASE_URL');
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true, url, anonKey };
}

export class SupabaseConfigError extends Error {
  constructor(config: Extract<SupabaseConfig, { ok: false }>) {
    const nomes = [...config.missing, ...config.invalid].join(', ');
    super(
      `Supabase não configurado: verifique ${nomes} no arquivo .env.local (modelo em .env.example).`,
    );
    this.name = 'SupabaseConfigError';
  }
}

export const supabaseConfig: SupabaseConfig = readSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export const isSupabaseConfigured = supabaseConfig.ok;

/**
 * Cliente único do Supabase.
 *
 * Se as variáveis faltarem, a importação NÃO quebra o app: o `main.tsx` checa
 * `isSupabaseConfigured` e mostra a tela "Configuração ausente". Qualquer uso
 * acidental do cliente nesse estado lança um `SupabaseConfigError` claro.
 */
export const supabase: TypedSupabaseClient = supabaseConfig.ok
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : createUnconfiguredClient(supabaseConfig);

function createUnconfiguredClient(
  config: Extract<SupabaseConfig, { ok: false }>,
): TypedSupabaseClient {
  return new Proxy({} as TypedSupabaseClient, {
    get() {
      throw new SupabaseConfigError(config);
    },
  });
}
