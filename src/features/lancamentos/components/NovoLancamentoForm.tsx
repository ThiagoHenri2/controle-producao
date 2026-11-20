import { useId, useState, type FormEvent } from 'react';
import { Button, Stepper, useToast } from '@/components/ui';
import type { Categoria } from '@/features/categorias/api';
import { formatBRL, fromCentavos } from '@/lib/format';
import { diaMes } from '../dates';
import { useCreateLancamentos } from '../hooks';
import { montarItens, subtotalCentavos, totalCentavos, type Quantidades } from '../schema';
import { BarraAcaoFixa } from './BarraAcaoFixa';

type NovoLancamentoFormProps = {
  /** Só categorias ativas. */
  categorias: ReadonlyArray<Categoria>;
  /** Dono dos lançamentos (o próprio usuário ou o entregador alvo do gestor). */
  userId: string;
  /** Data do lançamento, `yyyy-MM-dd`. */
  data: string;
  hoje: string;
  /** Avisa a página que há um envio em andamento (trava o seletor de data). */
  onSavingChange?: (saving: boolean) => void;
};

/** Um Stepper por categoria ativa + barra fixa "Subtotal · Salvar" acima da BottomNav. */
export function NovoLancamentoForm({
  categorias,
  userId,
  data,
  hoje,
  onSavingChange,
}: NovoLancamentoFormProps) {
  const formId = useId();
  const toast = useToast();
  const createMutation = useCreateLancamentos();
  const [quantidades, setQuantidades] = useState<Quantidades>({});

  const subtotal = subtotalCentavos(categorias, quantidades);
  const temQuantidade = categorias.some((c) => (quantidades[c.id] ?? 0) > 0);
  const saving = createMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const itens = montarItens(categorias, quantidades);
    if (itens.length === 0) return;
    onSavingChange?.(true);
    createMutation.mutate(
      { userId, data, itens },
      {
        onSuccess: (rows) => {
          // Total oficial: soma do `valor_total` gravado (preço congelado), em centavos.
          const total = formatBRL(fromCentavos(totalCentavos(rows)));
          toast.success(
            data === hoje
              ? `Lançamentos salvos — ${total}`
              : `Lançamentos salvos em ${diaMes(data)} — ${total}`,
          );
          setQuantidades({});
        },
        // Mantém os valores digitados para tentar de novo.
        onError: (err) => toast.error(err.message),
        onSettled: () => onSavingChange?.(false),
      },
    );
  }

  return (
    <form id={formId} noValidate onSubmit={handleSubmit} aria-label="Novo lançamento">
      <ul className="flex flex-col gap-2">
        {categorias.map((c) => {
          const qtd = quantidades[c.id] ?? 0;
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface py-2 pl-3 pr-2 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-900">{c.nome}</p>
                <p className="text-sm tabular-nums text-slate-600">
                  {formatBRL(c.valor_unitario)}
                  {qtd > 0 && (
                    <span className="font-medium text-slate-800">
                      {' '}
                      · {formatBRL(fromCentavos(subtotalCentavos([c], quantidades)))}
                    </span>
                  )}
                </p>
              </div>
              <Stepper
                label={c.nome}
                hideLabel
                value={qtd}
                onChange={(n) => setQuantidades((q) => ({ ...q, [c.id]: n }))}
                disabled={saving}
                className="shrink-0"
              />
            </li>
          );
        })}
      </ul>

      <BarraAcaoFixa>
        <div className="min-w-0 shrink-0" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-medium text-slate-600">Subtotal</p>
          <p className="text-lg font-bold tabular-nums text-slate-900" data-testid="subtotal">
            {formatBRL(fromCentavos(subtotal))}
          </p>
        </div>
        <Button
          type="submit"
          form={formId}
          size="lg"
          fullWidth
          className="flex-1"
          loading={saving}
          disabled={!temQuantidade}
        >
          Salvar
        </Button>
      </BarraAcaoFixa>
    </form>
  );
}
