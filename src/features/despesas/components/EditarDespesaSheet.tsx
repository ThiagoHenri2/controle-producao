import { useId, useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import {
  BottomSheet,
  Button,
  ConfirmDialog,
  Input,
  Select,
  useToast,
  type SelectOption,
} from '@/components/ui';
import { valorParaInput } from '@/features/categorias/schema';
import { useCategoriasDespesa } from '@/features/categorias/hooks';
import { formatBRL } from '@/lib/format';
import type { DespesaComCategoria } from '../api';
import { useDeleteDespesa, useUpdateDespesa } from '../hooks';
import { DESCRICAO_MAX, validarDespesa, type DespesaFormErrors } from '../schema';

type EditarDespesaSheetProps = {
  despesa: DespesaComCategoria;
  onClose: () => void;
};

/** Edita categoria, valor e descrição; exclui com confirmação. */
export function EditarDespesaSheet({ despesa, onClose }: EditarDespesaSheetProps) {
  const formId = useId();
  const toast = useToast();
  const updateMutation = useUpdateDespesa();
  const deleteMutation = useDeleteDespesa();
  const categorias = useCategoriasDespesa(despesa.user_id, { incluirInativas: true });
  const [categoriaId, setCategoriaId] = useState(despesa.categoria_despesa_id);
  const [valor, setValor] = useState(valorParaInput(despesa.valor));
  const [descricao, setDescricao] = useState(despesa.descricao ?? '');
  const [errors, setErrors] = useState<DespesaFormErrors>({});
  const [confirmando, setConfirmando] = useState(false);

  const nome = despesa.categoria?.nome ?? 'Despesa';
  const busy = updateMutation.isPending || deleteMutation.isPending;

  // Ativas do dono + a atual (mesmo se inativa, para não trocar sem querer).
  const opcoes = useMemo<SelectOption[]>(() => {
    const lista = (categorias.data ?? []).filter(
      (c) => c.ativa || c.id === despesa.categoria_despesa_id,
    );
    if (!lista.some((c) => c.id === despesa.categoria_despesa_id)) {
      return [{ value: despesa.categoria_despesa_id, label: nome }];
    }
    return lista.map((c) => ({ value: c.id, label: c.ativa ? c.nome : `${c.nome} (inativa)` }));
  }, [categorias.data, despesa.categoria_despesa_id, nome]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validarDespesa({ categoria_despesa_id: categoriaId, valor, descricao });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const { categoria_despesa_id, valor: novoValor, descricao: novaDescricao } = result.despesa;
    const patch = { categoria_despesa_id, valor: novoValor, descricao: novaDescricao };
    updateMutation.mutate(
      { id: despesa.id, userId: despesa.user_id, data: despesa.data, patch },
      {
        onSuccess: () => {
          toast.success('Despesa atualizada.');
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete() {
    deleteMutation.mutate(
      { id: despesa.id, userId: despesa.user_id, data: despesa.data },
      {
        onSuccess: () => {
          setConfirmando(false);
          toast.success('Despesa excluída.');
          onClose();
        },
        onError: (err) => {
          setConfirmando(false);
          toast.error(err.message);
        },
      },
    );
  }

  return (
    <>
      <BottomSheet
        open
        title="Editar despesa"
        onClose={onClose}
        closeDisabled={busy || confirmando}
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="border-danger/40 text-danger"
              leftIcon={<Trash2 className="h-5 w-5" aria-hidden />}
              onClick={() => setConfirmando(true)}
              disabled={busy}
            >
              Excluir
            </Button>
            <Button
              type="submit"
              form={formId}
              fullWidth
              loading={updateMutation.isPending}
              disabled={busy}
            >
              Salvar
            </Button>
          </div>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select
            label="Categoria"
            name="categoria"
            options={opcoes}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            error={errors.categoria_despesa_id}
            disabled={busy}
          />
          <Input
            label="Valor (R$)"
            name="valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onFocus={(e) => e.target.select()}
            error={errors.valor}
            disabled={busy}
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
            disabled={busy}
          />
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={confirmando}
        title="Excluir despesa?"
        description={`${nome}: ${formatBRL(despesa.valor)}.`}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}
