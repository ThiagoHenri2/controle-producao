import { useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { isDataISO, rotuloDataLonga, rotuloDiaSemana, somarDias } from '../dates';

type DateSelectorProps = {
  /** Data selecionada, `yyyy-MM-dd`. */
  value: string;
  /** Hoje, `yyyy-MM-dd` (limite superior). */
  hoje: string;
  onChange: (data: string) => void;
  disabled?: boolean;
};

const navBtn =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30';

/**
 * ◀ dia anterior · rótulo da data (abre o calendário nativo) · ▶ próximo dia.
 * Não permite data futura. Fora de hoje, mostra uma faixa de alerta.
 */
export function DateSelector({ value, hoje, onChange, disabled = false }: DateSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ehHoje = value === hoje;
  const rotulo = rotuloDataLonga(value);

  function abrirCalendario() {
    const input = inputRef.current;
    if (!input || disabled) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // Navegador sem suporte (ou bloqueado): cai no fallback abaixo.
    }
    input.focus();
    input.click();
  }

  function handleInput(raw: string) {
    if (!isDataISO(raw)) return;
    onChange(raw > hoje ? hoje : raw);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex items-center gap-1 rounded-xl border border-slate-200 bg-surface p-1 shadow-sm">
        <button
          type="button"
          className={navBtn}
          aria-label="Dia anterior"
          onClick={() => onChange(somarDias(value, -1))}
          disabled={disabled}
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        <button
          type="button"
          onClick={abrirCalendario}
          disabled={disabled}
          aria-label={`Data: ${rotulo}. Escolher outra data`}
          className="flex min-h-touch min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-base font-bold tabular-nums text-slate-900 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60"
        >
          <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="truncate" data-testid="data-rotulo">
            {rotulo}
          </span>
        </button>
        <button
          type="button"
          className={navBtn}
          aria-label="Próximo dia"
          onClick={() => onChange(somarDias(value, 1))}
          disabled={disabled || value >= hoje}
        >
          <ChevronRight className="h-6 w-6" aria-hidden />
        </button>
        <label htmlFor="lancamento-data" className="sr-only">
          Data do lançamento
        </label>
        {/* Calendário nativo, visualmente escondido; aberto pelo botão do rótulo. */}
        <input
          ref={inputRef}
          id="lancamento-data"
          type="date"
          tabIndex={-1}
          max={hoje}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          disabled={disabled}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      </div>

      {!ehHoje && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-900"
        >
          <p className="min-w-0 flex-1">
            Lançando para <strong className="font-bold">{rotuloDiaSemana(value)}</strong>
          </p>
          <button
            type="button"
            onClick={() => onChange(hoje)}
            disabled={disabled}
            className="min-h-touch shrink-0 rounded-lg px-3 font-semibold text-amber-900 underline underline-offset-2 hover:bg-amber-100 disabled:opacity-60"
          >
            Voltar para hoje
          </button>
        </div>
      )}
    </div>
  );
}
