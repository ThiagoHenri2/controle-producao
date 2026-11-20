import { useId, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet, Button, ConfirmDialog, Input, useToast } from '@/components/ui';
import { formatBRL } from '@/lib/format';
import type { LancamentoComCategoria } from '../api';
import { useDeleteLancamento, useUpdateLancamento } from '../hooks';
import { OBSERVACAO_MAX, validarEdicao, type EditarLancamentoErrors } from '../schema';

type EditarLancamentoSheetProps = {
  lancamento: LancamentoComCategoria;
  onClose: () => void;
};

/** Edita quantidade e observação (o preço congelado não muda) e exclui com confirmação. */
export function EditarLancamentoSheet({ lancamento, onClose }: EditarLancamentoSheetProps) {
  const formId = useId();
  const toast = useToast();
  const updateMutation = useUpdateLancamento();
  const deleteMutation = useDeleteLancamento();
  const [quantidade, setQuantidade] = useState(String(lancamento.quantidade));
  const [observacao, setObservacao] = useState(lancamento.observacao ?? '');
  const [errors, setErrors] = useState<EditarLancamentoErrors>({});
  const [confirmando, setConfirmando] = useState(false);

  const nome = lancamento.categoria?.nome ?? 'Lançamento';
  const busy = updateMutation.isPending || deleteMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validarEdicao({ quantidade, observacao });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    updateMutation.mutate(
      { id: lancamento.id, data: lancamento.data, patch: result.patch },
      {
        onSuccess: () => {
          toast.success('Lançamento atualizado.');
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleDelete() {
    deleteMutation.mutate(
      { id: lancamento.id, data: lancamento.data },
      {
        onSuccess: () => {
          setConfirmando(false);
          toast.success('Lançamento excluído.');
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
        title={`Editar ${nome}`}
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
          <Input
            label="Quantidade"
            name="quantidade"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            onFocus={(e) => e.target.select()}
            hint={`Preço congelado: ${formatBRL(lancamento.valor_unitario)} por entrega.`}
            error={errors.quantidade}
            disabled={busy}
          />
          <Input
            label="Observação (opcional)"
            name="observacao"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={OBSERVACAO_MAX + 20}
            placeholder="Ex.: turno da noite"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            error={errors.observacao}
            disabled={busy}
          />
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={confirmando}
        title="Excluir lançamento?"
        description={`${nome}: ${lancamento.quantidade} × ${formatBRL(lancamento.valor_unitario)} = ${formatBRL(lancamento.valor_total)}.`}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}
