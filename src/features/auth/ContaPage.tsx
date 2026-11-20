import { useAuth } from './auth-context';
import { ContaResumo } from './components/ContaResumo';
import { TrocarSenhaForm } from './components/TrocarSenhaForm';

/** Minha conta (spec 010): dados do usuário logado e troca da própria senha. */
export function ContaPage() {
  const { profile } = useAuth();
  // Dentro do ProtectedRoute o perfil ativo sempre existe.
  if (!profile) return null;
  return (
    <div className="flex flex-col gap-4">
      <ContaResumo profile={profile} />
      <TrocarSenhaForm username={profile.username} />
    </div>
  );
}
