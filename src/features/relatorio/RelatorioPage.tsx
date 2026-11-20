import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui';

/** Placeholder da tela Relatório (spec 005). */
export function RelatorioPage() {
  return (
    <EmptyState
      icon={BarChart3}
      title="Relatório em breve"
      description="Aqui você vai ver o total em R$ por período e por categoria."
    />
  );
}
