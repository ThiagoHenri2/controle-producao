import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Profile = Tables<'profiles'>;

/** Perfil do usuário logado. `null` quando não existe linha em `profiles`. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nome, role, ativo, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
