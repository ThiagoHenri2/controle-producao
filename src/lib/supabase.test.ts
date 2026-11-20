import { describe, expect, it } from 'vitest';
import { readSupabaseConfig, SupabaseConfigError } from './supabase';

describe('readSupabaseConfig', () => {
  it('aceita URL e chave válidas', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'chave',
      }),
    ).toEqual({ ok: true, url: 'https://abc.supabase.co', anonKey: 'chave' });
  });

  it('aponta as variáveis ausentes', () => {
    const cfg = readSupabaseConfig({ VITE_SUPABASE_URL: '  ' });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) {
      expect(cfg.missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
      expect(new SupabaseConfigError(cfg).message).toMatch(/VITE_SUPABASE_URL/);
    }
  });

  it('rejeita URL sem http(s)', () => {
    const cfg = readSupabaseConfig({
      VITE_SUPABASE_URL: 'abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'x',
    });
    expect(cfg).toEqual({ ok: false, missing: [], invalid: ['VITE_SUPABASE_URL'] });
  });
});
