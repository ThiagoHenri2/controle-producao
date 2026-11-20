import { describe, expectTypeOf, it } from 'vitest';
import type { TablesInsert } from './database.types';
import type { TypedSupabaseClient } from './supabase';

// Verificações de tipo: quem garante é o `tsc -b` do `npm run build`.
function selectCategorias(client: TypedSupabaseClient) {
  return client.from('categorias').select('id, nome, valor_unitario');
}
type CategoriaRow = NonNullable<Awaited<ReturnType<typeof selectCategorias>>['data']>[number];

describe('database.types', () => {
  it('tipa supabase.from("categorias")', () => {
    expectTypeOf(selectCategorias).toBeFunction();
    expectTypeOf<CategoriaRow>().toEqualTypeOf<{
      id: string;
      nome: string;
      valor_unitario: number;
    }>();
  });

  it('lancamentos.Insert: preço e user_id opcionais, sem valor_total', () => {
    const minimo: TablesInsert<'lancamentos'> = {
      categoria_id: 'c1',
      data: '2026-11-20',
      quantidade: 3,
    };
    expectTypeOf(minimo).toEqualTypeOf<TablesInsert<'lancamentos'>>();
    expectTypeOf<TablesInsert<'lancamentos'>>().not.toHaveProperty('valor_total');
  });
});
