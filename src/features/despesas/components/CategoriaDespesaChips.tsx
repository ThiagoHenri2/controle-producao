import { useId } from 'react';
import { cn } from '@/lib/cn';
import type { CategoriaDespesa } from '../api';

type CategoriaDespesaChipsProps = {
  categorias: ReadonlyArray<Pick<CategoriaDespesa, 'id' | 'nome'>>;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
};

/**
 * Escolha da categoria de despesa com chips de toque (rádios nativos, então
 * setas do teclado e leitores de tela funcionam). Quebra em várias linhas em 360px.
 */
export function CategoriaDespesaChips({
  categorias,
  value,
  onChange,
  error,
  disabled = false,
}: CategoriaDespesaChipsProps) {
  const name = useId();
  const errorId = useId();
  const legendId = useId();
  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      className="flex flex-col gap-1"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      disabled={disabled}
    >
      <legend id={legendId} className="mb-1 text-sm font-medium text-slate-700">
        Categoria
      </legend>
      <div className="flex flex-wrap gap-2">
        {categorias.map((c) => {
          const marcada = c.id === value;
          return (
            <label
              key={c.id}
              className={cn(
                'flex min-h-touch max-w-full cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition-colors',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                marcada
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-slate-300 bg-surface text-slate-800 hover:bg-slate-50',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={c.id}
                checked={marcada}
                onChange={() => onChange(c.id)}
                className="sr-only"
              />
              <span className="truncate">{c.nome}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
