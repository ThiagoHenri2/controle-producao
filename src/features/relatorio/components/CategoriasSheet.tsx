import { useId, useState } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { FiltroCategorias } from '../api';
import { FILTRO_MESSAGES } from '../filtroCategorias';

/**
 * Opção da checklist: uma categoria do usuário (Relatório) ou um nome de
 * categoria agrupado (Equipe, onde `id` é o nome normalizado).
 */
export type OpcaoCategoria = { id: string; nome: string; ativa?: boolean };

type CategoriasSheetProps = {
  /** Opções na ordem da lista (no Relatório: ativas primeiro, depois inativas, por nome). */
  categorias: readonly OpcaoCategoria[];
  /** Seleção atual (`null` = todas). */
  selecionadas: FiltroCategorias;
  /** Recebe os IDs marcados, na ordem da lista. */
  onAplicar: (ids: string[]) => void;
  onClose: () => void;
};

/**
 * Checklist "Filtrar categorias". Edita uma cópia local da seleção: só "Aplicar"
 * grava; fechar descarta. Monte só quando aberto, para recomeçar da seleção atual.
 */
export function CategoriasSheet({
  categorias,
  selecionadas,
  onAplicar,
  onClose,
}: CategoriasSheetProps) {
  const legendId = useId();
  const hintId = useId();
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(
    () => new Set(selecionadas ?? categorias.map((c) => c.id)),
  );
  const nenhuma = marcadas.size === 0;

  function alternar(id: string) {
    setMarcadas((atual) => {
      const next = new Set(atual);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <BottomSheet
      open
      title="Filtrar categorias"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {nenhuma && (
            <p id={hintId} className="text-center text-sm font-medium text-danger" role="status">
              {FILTRO_MESSAGES.semSelecao}
            </p>
          )}
          <Button
            fullWidth
            size="lg"
            disabled={nenhuma}
            aria-describedby={nenhuma ? hintId : undefined}
            onClick={() => onAplicar(categorias.filter((c) => marcadas.has(c.id)).map((c) => c.id))}
          >
            Aplicar
          </Button>
        </div>
      }
    >
      <fieldset aria-labelledby={legendId} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span id={legendId} className="text-sm font-medium tabular-nums text-slate-700">
            {marcadas.size} de {categorias.length} marcadas
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              className="px-3 text-sm text-primary"
              onClick={() => setMarcadas(new Set(categorias.map((c) => c.id)))}
            >
              Marcar todas
            </Button>
            <Button
              variant="ghost"
              className="px-3 text-sm text-primary"
              onClick={() => setMarcadas(new Set())}
            >
              Limpar
            </Button>
          </div>
        </div>
        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
          {categorias.map((c) => (
            <li key={c.id}>
              <label
                className={cn(
                  'flex min-h-touch cursor-pointer items-center gap-3 px-3 py-2',
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                )}
              >
                <input
                  type="checkbox"
                  checked={marcadas.has(c.id)}
                  onChange={() => alternar(c.id)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded accent-primary"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate font-medium',
                    c.ativa === false ? 'text-slate-600' : 'text-slate-900',
                  )}
                >
                  {c.nome}
                </span>
                {c.ativa === false && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    inativa
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </BottomSheet>
  );
}
