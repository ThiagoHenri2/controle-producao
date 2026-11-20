import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { PeriodoRapido, PeriodoTipo } from '../periodos';

type PeriodoChipsProps = {
  ativo: PeriodoTipo;
  onRapido: (tipo: PeriodoRapido) => void;
  onPersonalizado: () => void;
};

const RAPIDOS: ReadonlyArray<{ tipo: PeriodoRapido; label: string }> = [
  { tipo: 'hoje', label: 'Hoje' },
  { tipo: 'semana', label: 'Semana' },
  { tipo: 'mes', label: 'Mês' },
];

function chipClass(pressed: boolean) {
  return cn(
    'flex min-h-touch items-center justify-center gap-1 rounded-full border px-2 text-sm font-semibold transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    pressed
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-slate-300 bg-surface text-slate-800 hover:bg-slate-50 active:bg-slate-100',
  );
}

/** Hoje · Semana · Mês · Período (abre o seletor de datas). */
export function PeriodoChips({ ativo, onRapido, onPersonalizado }: PeriodoChipsProps) {
  return (
    <div role="group" aria-label="Período" className="grid grid-cols-4 gap-2">
      {RAPIDOS.map(({ tipo, label }) => (
        <button
          key={tipo}
          type="button"
          aria-pressed={ativo === tipo}
          onClick={() => onRapido(tipo)}
          className={chipClass(ativo === tipo)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={ativo === 'personalizado'}
        aria-haspopup="dialog"
        onClick={onPersonalizado}
        className={chipClass(ativo === 'personalizado')}
      >
        <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
        Período
      </button>
    </div>
  );
}
