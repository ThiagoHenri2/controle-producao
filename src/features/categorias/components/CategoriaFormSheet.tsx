import { useId, useState, type FormEvent } from 'react';
import { Info, Trash2 } from 'lucide-react';
import { BottomSheet, Button, ConfirmDialog, Input, Switch, useToast } from '@/components/ui';
import type { Categoria } from '../api';
import { CATEGORIA_ERROR_MESSAGES, type CategoriaError } from '../errors';
import { useCreateCategoria, useDeleteCategoria, useUpdateCategoria } from '../hooks';
import {
  NOME_MAX,
  validarCategoriaForm,
  valorParaInput,
  type CategoriaFormErrors,
} from '../schema';

export const AVISO_REAJUSTE = 'O novo valor vale para os próximos lançamentos.';

type CategoriaFormSheetProps = {
  /** `null` = nova categoria. */
  categoria: Categoria | null;
  /** Lista completa (ativas e inativas) para checar nome duplicado. */
  existentes: ReadonlyArray<Pick<Categoria, 'id' | 'nome'>>;
  onClose: () => void;
};

type DeleteStep = 'none' | 'confirm' | 'em_uso';

/** Bottom sheet de criar/editar categoria, com excluir (e "Desativar" quando há lançamentos). */
export function CategoriaFormSheet({ categoria, existentes, onClose }: CategoriaFormSheetProps) {
  const formId = useId();
  const toast = useToast();
  const createMutation = useCreateCategoria();
  const updateMutation = useUpdateCategoria();
  const deleteMutation = useDeleteCategoria();

  const editando = categoria !== null;
  const valorInicial = editando ? valorParaInput(categoria.valor_unitario) : '';
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [valor, setValor] = useState(valorInicial);
  const [ativa, setAtiva] = useState(categoria?.ativa ?? true);
  const [errors, setErrors] = useState<CategoriaFormErrors>({});
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('none');

  const saving = createMutation.isPending || updateMutation.isPending;
  const busy = saving || deleteMutation.isPending;
  const valorAlterado = editando && valor.trim() !== valorInicial;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validarCategoriaForm({ nome, valor, ativa }, existentes, categoria?.id);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    const onError = (err: CategoriaError) => {
      if (err.kind === 'duplicado') setErrors({ nome: err.message });
      else toast.error(err.message);
    };

    if (editando) {
      updateMutation.mutate(
        { id: categoria.id, patch: result.payload },
        {
          onSuccess: () => {
            toast.success('Categoria salva.');
            onClose();
          },
          onError,
        },
      );
    } else {
      createMutation.mutate(result.payload, {
        onSuccess: () => {
          toast.success('Categoria criada.');
          onClose();
        },
        onError,
      });
    }
  }

  function handleDelete() {
    if (!categoria) return;
    deleteMutation.mutate(categoria.id, {
      onSuccess: () => {
        setDeleteStep('none');
        toast.success('Categoria excluída.');
        onClose();
      },
      onError: (err) => {
        if (err.kind === 'em_uso' && categoria.ativa) {
          setDeleteStep('em_uso');
          return;
        }
        setDeleteStep('none');
        toast.error(err.kind === 'em_uso' ? CATEGORIA_ERROR_MESSAGES.emUsoInativa : err.message);
      },
    });
  }

  function handleDesativar() {
    if (!categoria) return;
    updateMutation.mutate(
      { id: categoria.id, patch: { ativa: false } },
      {
        onSuccess: () => {
          setDeleteStep('none');
          toast.success('Categoria desativada.');
          onClose();
        },
        onError: (err) => {
          setDeleteStep('none');
          toast.error(err.message);
        },
      },
    );
  }

  return (
    <>
      <BottomSheet
        open
        title={editando ? 'Editar categoria' : 'Nova categoria'}
        onClose={onClose}
        closeDisabled={busy || deleteStep !== 'none'}
        footer={
          <div className="flex gap-3">
            {editando && (
              <Button
                variant="secondary"
                className="border-danger/40 text-danger"
                leftIcon={<Trash2 className="h-5 w-5" aria-hidden />}
                onClick={() => setDeleteStep('confirm')}
                disabled={busy}
              >
                Excluir
              </Button>
            )}
            <Button type="submit" form={formId} fullWidth loading={saving} disabled={busy}>
              Salvar
            </Button>
          </div>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Nome"
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={NOME_MAX + 20}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            placeholder="Ex.: Sanduíche"
            error={errors.nome}
            disabled={busy}
          />
          <Input
            label="Valor por entrega (R$)"
            name="valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            error={errors.valor}
            disabled={busy}
          />
          {valorAlterado && (
            <p
              role="note"
              className="flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-sm font-medium text-slate-900"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {AVISO_REAJUSTE}
            </p>
          )}
          <Switch
            label="Ativa"
            description={ativa ? 'Aparece na tela Lançar.' : 'Não aparece na tela Lançar.'}
            checked={ativa}
            onChange={setAtiva}
            disabled={busy}
          />
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleteStep === 'confirm'}
        title="Excluir categoria?"
        description={categoria ? `"${categoria.nome}" será excluída.` : undefined}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteStep('none')}
      />
      <ConfirmDialog
        open={deleteStep === 'em_uso'}
        title="Não dá para excluir"
        description={CATEGORIA_ERROR_MESSAGES.emUso}
        confirmLabel="Desativar"
        variant="primary"
        loading={updateMutation.isPending}
        onConfirm={handleDesativar}
        onCancel={() => setDeleteStep('none')}
      />
    </>
  );
}
