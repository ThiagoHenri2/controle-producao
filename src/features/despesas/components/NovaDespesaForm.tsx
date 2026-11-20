import { useId, useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { diaMes } from '@/features/lancamentos/dates';
import { BarraAcaoFixa } from '@/features/lancamentos/components/BarraAcaoFixa';
import { formatBRL, fromCentavos } from '@/lib/format';
import type { CategoriaDespesa } from '../api';
import { useCreateDespesa } from '../hooks';
import { DESCRICAO_MAX, validarDespesa, type DespesaFormErrors } from '../schema';
import { CategoriaDespesaChips } from './CategoriaDespesaChips';

type NovaDespesaFormProps = {
  /** Só categorias de despesa ativas do dono. */
  categorias: ReadonlyArray<CategoriaDespesa>;
  /** Dono da despesa (o próprio usuário ou o entregador alvo do gestor). */
  userId: string;
  /** Data da despesa, `yyyy-MM-dd`. */
  data: string;
  hoje: string;
  /** Avisa a página que há um envio em andamento (trava o seletor de data). */
  onSavingChange?: (saving: boolean) => void;
};

/**
 * Categoria (chips) + Valor (R$, valor livre) + Descrição opcional, com o botão
 * "Adicionar despesa" fixo acima da BottomNav. Com uma categoria só, ela já vem marcada.
 */
export function NovaDespesaForm({
  categorias,
  userId,
  data,
  hoje,
  onSavingChange,
}: NovaDespesaFormProps) {
  const formId = useId();
  const toast = useToast();
  const createMutation = useCreateDespesa();
  const [categoriaId, setCategoriaId] = useState(categorias.length === 1 ? categorias[0].id : '');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [errors, setErrors] = useState<DespesaFormErrors>({});
  const saving = createMutation.isPending;

  // Categoria escolhida que deixou de estar ativa (lista recarregada) volta para "nenhuma".
  const categoriaValida = categorias.some((c) => c.id === categoriaId) ? categoriaId : '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const result = validarDespesa({ categoria_despesa_id: categoriaValida, valor, descricao });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const { centavos, ...despesa } = result.despesa;
    onSavingChange?.(true);
    createMutation.mutate(
      { ...despesa, user_id: userId, data },
      {
        onSuccess: () => {
          const total = formatBRL(fromCentavos(centavos));
          toast.success(
            data === hoje
              ? `Despesa adicionada — ${total}`
              : `Despesa adicionada em ${diaMes(data)} — ${total}`,
          );
          // Mantém a categoria para lançar outra em sequência.
          setValor('');
          setDescricao('');
        },
        // Mantém o que foi digitado para tentar de novo.
        onError: (err) => toast.error(err.message),
        onSettled: () => onSavingChange?.(false),
      },
    );
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={handleSubmit}
      aria-label="Nova despesa"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-surface p-4 shadow-sm"
    >
      <CategoriaDespesaChips
        categorias={categorias}
        value={categoriaValida}
        onChange={setCategoriaId}
        error={errors.categoria_despesa_id}
        disabled={saving}
      />
      <Input
        label="Valor (R$)"
        name="valor"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        placeholder="0,00"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        error={errors.valor}
        disabled={saving}
      />
      <Input
        label="Descrição (opcional)"
        name="descricao"
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="done"
        maxLength={DESCRICAO_MAX + 20}
        placeholder="Ex.: posto da esquina"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        error={errors.descricao}
        disabled={saving}
      />

      <BarraAcaoFixa>
        <Button type="submit" form={formId} size="lg" fullWidth loading={saving}>
          Adicionar despesa
        </Button>
      </BarraAcaoFixa>
    </form>
  );
}
