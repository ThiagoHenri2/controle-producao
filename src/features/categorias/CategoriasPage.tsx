import { Plus, Tags } from 'lucide-react';
import { Button, EmptyState, useToast } from '@/components/ui';

/** Placeholder da tela Categorias (spec 003). */
export function CategoriasPage() {
  const toast = useToast();
  return (
    <EmptyState
      icon={Tags}
      title="Categorias em breve"
      description="Aqui você vai cadastrar os tipos de entrega e o valor de cada um."
      action={
        <Button
          fullWidth
          leftIcon={<Plus className="h-5 w-5" aria-hidden />}
          onClick={() => toast.show({ message: 'Cadastro de categorias chega em breve.' })}
        >
          Nova categoria
        </Button>
      }
    />
  );
}
