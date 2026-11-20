import { PlusCircle } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { formatData, hojeISO } from '@/lib/format';

/** Placeholder da tela Lançar (spec 004). */
export function LancamentosPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-sm text-slate-600">Data</p>
        <p className="text-lg font-semibold tabular-nums">Hoje · {formatData(hojeISO())}</p>
      </Card>
      <EmptyState
        icon={PlusCircle}
        title="Lançamentos em breve"
        description="Aqui você vai registrar as entregas do dia por categoria."
      />
    </div>
  );
}
