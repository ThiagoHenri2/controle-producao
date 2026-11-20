import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui';

/** Placeholder da tela de administração de usuários (spec 006). */
export function UsuariosPage() {
  return (
    <EmptyState
      icon={Users}
      title="Usuários em breve"
      description="Aqui o admin vai criar e gerenciar os acessos dos entregadores."
    />
  );
}
