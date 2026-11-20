import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '../auth-context';

/** Botão "Sair" do cabeçalho. A navegação para /login fica a cargo do ProtectedRoute. */
export function LogoutButton() {
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await signOut();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Sair"
      title="Sair"
      loading={pending}
      onClick={handleClick}
    >
      {!pending && <LogOut className="h-5 w-5" aria-hidden />}
    </Button>
  );
}
