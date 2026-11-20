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

/** Uma seção da checklist (ex.: "Entregas" e "Despesas", spec 009). */
export type SecaoFiltro = {
  titulo: string;
  /** Opções na ordem da lista (no Relatório: ativas primeiro, depois inativas, por nome). */
  opcoes: readonly OpcaoCategoria[];
  /** Seleção atual (`null` = todas; `[]` = nenhuma). */
  selecionadas: FiltroCategorias;
};

type CategoriasSheetProps = {
  /** Uma seção (sem título) ou várias (com título). Seções sem opções não aparecem. */
  secoes: readonly SecaoFiltro[];
  /** Recebe os IDs marcados de cada seção (na ordem de `secoes` e da lista). */
  onAplicar: (porSecao: string[][]) => void;
  onClose: () => void;
};

/**
 * Checklist "Filtrar categorias". Edita uma cópia local da seleção: só "Aplicar"
 * grava; fechar descarta. Monte só quando aberto, para recomeçar da seleção atual.
 * Com uma seção, exige ao menos uma marcada; com várias, ao menos uma no total
 * (uma seção vazia vira "nenhuma", ex.: sem despesas no saldo).
 */
export function CategoriasSheet({ secoes, onAplicar, onClose }: CategoriasSheetProps) {
  const hintId = useId();
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>[]>(() =>
    secoes.map((s) => new Set(s.selecionadas ?? s.opcoes.map((c) => c.id))),
  );
  const nenhuma = marcadas.every((m) => m.size === 0);
  const varias = secoes.filter((s) => s.opcoes.length > 0).length > 1;

  function setSecao(i: number, next: ReadonlySet<string>) {
    setMarcadas((atual) => atual.map((m, j) => (j === i ? next : m)));
  }

  function alternar(i: number, id: string) {
    const next = new Set(marcadas[i]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSecao(i, next);
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
            onClick={() =>
              onAplicar(
                secoes.map((s, i) =>
                  s.opcoes.filter((c) => marcadas[i].has(c.id)).map((c) => c.id),
                ),
              )
            }
          >
            Aplicar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {secoes.map((secao, i) =>
          secao.opcoes.length === 0 ? null : (
            <Secao
              key={secao.titulo}
              secao={secao}
              comTitulo={varias}
              marcadas={marcadas[i]}
              onAlternar={(id) => alternar(i, id)}
              onTodas={() => setSecao(i, new Set(secao.opcoes.map((c) => c.id)))}
              onLimpar={() => setSecao(i, new Set())}
            />
          ),
        )}
      </div>
    </BottomSheet>
  );
}

type SecaoProps = {
  secao: SecaoFiltro;
  comTitulo: boolean;
  marcadas: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onTodas: () => void;
  onLimpar: () => void;
};

function Secao({ secao, comTitulo, marcadas, onAlternar, onTodas, onLimpar }: SecaoProps) {
  const legendId = useId();
  const { titulo, opcoes } = secao;
  const contagem = `${marcadas.size} de ${opcoes.length} marcadas`;
  return (
    <fieldset aria-labelledby={legendId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {comTitulo ? (
          <h3 id={legendId} className="flex flex-col text-base font-bold text-slate-900">
            {titulo}
            <span className="text-sm font-medium tabular-nums text-slate-600">{contagem}</span>
          </h3>
        ) : (
          <span id={legendId} className="text-sm font-medium tabular-nums text-slate-700">
            {contagem}
          </span>
        )}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            className="px-3 text-sm text-primary"
            aria-label={comTitulo ? `Marcar todas: ${titulo}` : undefined}
            onClick={onTodas}
          >
            Marcar todas
          </Button>
          <Button
            variant="ghost"
            className="px-3 text-sm text-primary"
            aria-label={comTitulo ? `Limpar: ${titulo}` : undefined}
            onClick={onLimpar}
          >
            Limpar
          </Button>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
        {opcoes.map((c) => (
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
                onChange={() => onAlternar(c.id)}
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
  );
}
