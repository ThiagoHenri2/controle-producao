import { AlertTriangle } from 'lucide-react';
import type { SupabaseConfig } from '@/lib/supabase';

type ConfigErrorScreenProps = { config: Extract<SupabaseConfig, { ok: false }> };

/** Tela exibida quando faltam as variáveis do Supabase (em vez de tela branca). */
export function ConfigErrorScreen({ config }: ConfigErrorScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 shrink-0 text-danger" aria-hidden />
          <h1 className="text-xl font-bold text-slate-900">Configuração ausente</h1>
        </div>
        <p className="text-slate-700">
          O app não consegue se conectar ao servidor porque a configuração do Supabase está
          incompleta.
        </p>
        <ul className="flex flex-col gap-1 text-sm text-slate-700">
          {config.missing.map((nome) => (
            <li key={nome}>
              Faltando: <code className="font-mono font-semibold text-slate-900">{nome}</code>
            </li>
          ))}
          {config.invalid.map((nome) => (
            <li key={nome}>
              Inválida: <code className="font-mono font-semibold text-slate-900">{nome}</code>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600">
          Para quem administra: copie <code className="font-mono">.env.example</code> para{' '}
          <code className="font-mono">.env.local</code>, preencha os valores e reinicie o{' '}
          <code className="font-mono">npm run dev</code>. No deploy, confira os secrets do
          repositório.
        </p>
      </div>
    </main>
  );
}
