import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from '@/lib/supabase';
import { ConfigErrorScreen } from './ConfigErrorScreen';

describe('ConfigErrorScreen', () => {
  it('sem as envs, mostra mensagem legível com as variáveis faltando', () => {
    const config = readSupabaseConfig({});
    if (config.ok) throw new Error('esperava configuração inválida');
    render(<ConfigErrorScreen config={config} />);
    expect(screen.getByRole('heading', { name: 'Configuração ausente' })).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument();
  });
});
