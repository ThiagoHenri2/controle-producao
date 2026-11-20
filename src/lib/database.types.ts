/**
 * Tipos do banco (schema `public`), no formato do gerador do supabase-js v2.
 *
 * ESCRITO À MÃO a partir de `supabase/migrations/0001_schema_inicial.sql`,
 * porque a CLI ainda não está autenticada neste ambiente. Ajustes manuais em
 * relação ao gerador:
 *   - `profiles.role` é `'admin' | 'gerente' | 'user'` (o gerador daria `string`, pois é um CHECK);
 *   - `lancamentos.Insert.criado_por` não existe: o trigger da migration 0006 grava
 *     `auth.uid()` (o front nunca envia o autor);
 *   - `lancamentos.Insert.valor_unitario` é opcional (o trigger
 *     `lancamentos_preco_snapshot` copia o preço da categoria);
 *   - `lancamentos.valor_total` (coluna gerada) não aparece em Insert/Update;
 *   - `despesas.Insert`/`Update` não têm `criado_por` (trigger anti-forja da 0007)
 *     nem `updated_at` (a tabela não tem essa coluna).
 *
 * Para regenerar via CLI no futuro (depois de `npx supabase login`):
 *   npx supabase gen types typescript --project-id <ref-do-projeto> --schema public > src/lib/database.types.ts
 * e reaplique os ajustes acima (ou mantenha-os num tipo derivado).
 * Atualize este arquivo sempre que uma nova migration mudar o schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRole = 'admin' | 'gerente' | 'user';

/** Linha devolvida por `resumo_por_usuario` e `resumo_por_usuario_nomes` (migration 0006). */
export type ResumoUsuarioRow = {
  user_id: string;
  nome: string;
  username: string;
  role: ProfileRole;
  ativo: boolean;
  quantidade: number;
  valor: number;
  total_geral: number;
};

export type Database = {
  // Permite ao supabase-js inferir a versão do PostgREST (igual ao gerador).
  __InternalSupabase: {
    PostgrestVersion: '12.2.3';
  };
  public: {
    Tables: {
      categorias: {
        Row: {
          ativa: boolean;
          created_at: string;
          id: string;
          nome: string;
          updated_at: string;
          user_id: string;
          valor_unitario: number;
          /** Migration 0009 (spec 011): o gerente do dono só vê a categoria quando true. */
          visivel_gerente: boolean;
        };
        Insert: {
          ativa?: boolean;
          created_at?: string;
          id?: string;
          nome: string;
          updated_at?: string;
          user_id?: string;
          valor_unitario: number;
          visivel_gerente?: boolean;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
          user_id?: string;
          valor_unitario?: number;
          visivel_gerente?: boolean;
        };
        Relationships: [];
      };
      categorias_despesa: {
        // Migration 0007 (spec 009): categoria de despesa, sem valor fixo.
        Row: {
          ativa: boolean;
          created_at: string;
          id: string;
          nome: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ativa?: boolean;
          created_at?: string;
          id?: string;
          nome: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      despesas: {
        // Migration 0007 (spec 009): valor livre por lançamento.
        Row: {
          categoria_despesa_id: string;
          created_at: string;
          /** Autor da despesa. `null` se o autor foi apagado. */
          criado_por: string | null;
          data: string;
          descricao: string | null;
          id: string;
          user_id: string;
          valor: number;
        };
        Insert: {
          categoria_despesa_id: string;
          created_at?: string;
          data: string;
          descricao?: string | null;
          id?: string;
          user_id?: string;
          valor: number;
        };
        Update: {
          categoria_despesa_id?: string;
          created_at?: string;
          data?: string;
          descricao?: string | null;
          id?: string;
          user_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'despesas_categoria_despesa_id_fkey';
            columns: ['categoria_despesa_id'];
            isOneToOne: false;
            referencedRelation: 'categorias_despesa';
            referencedColumns: ['id'];
          },
        ];
      };
      lancamentos: {
        Row: {
          categoria_id: string;
          created_at: string;
          /** Autor do lançamento (migration 0006). `null` se o autor foi apagado. */
          criado_por: string | null;
          data: string;
          id: string;
          observacao: string | null;
          quantidade: number;
          user_id: string;
          valor_total: number;
          valor_unitario: number;
        };
        Insert: {
          categoria_id: string;
          created_at?: string;
          data: string;
          id?: string;
          observacao?: string | null;
          quantidade: number;
          user_id?: string;
          valor_unitario?: number;
        };
        Update: {
          categoria_id?: string;
          created_at?: string;
          data?: string;
          id?: string;
          observacao?: string | null;
          quantidade?: number;
          user_id?: string;
          valor_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'lancamentos_categoria_id_fkey';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'categorias';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          ativo: boolean;
          created_at: string;
          /** Gerente responsável (migration 0008). Só atendentes (`role = 'user'`) têm. */
          gerente_id: string | null;
          id: string;
          nome: string;
          role: ProfileRole;
          username: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          gerente_id?: string | null;
          id: string;
          nome: string;
          role?: ProfileRole;
          username: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          gerente_id?: string | null;
          id?: string;
          nome?: string;
          role?: ProfileRole;
          username?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      autores: {
        Args: { p_ids: string[] };
        Returns: { id: string; nome: string }[];
      };
      is_admin: { Args: never; Returns: boolean };
      is_ativo: { Args: never; Returns: boolean };
      is_gestor: { Args: never; Returns: boolean };
      // Migration 0008 (spec 010): gerente do chamador (0 ou 1 linha).
      meu_gerente: {
        Args: never;
        Returns: { id: string; nome: string; username: string }[];
      };
      /** Migration 0008: o chamador pode operar os dados de `p_alvo`? */
      pode_gerir: { Args: { p_alvo: string }; Returns: boolean };
      // Migrations 0003_resumo.sql e 0005_resumo_filtro_categorias.sql (spec 005).
      // `p_categorias` omitido/null = todas as categorias.
      // `p_usuario` (0006) omitido/null = o próprio usuário; outro id exige gestor (42501).
      // `bigint`/`numeric` → number; `date`/`uuid` → string.
      // Migration 0007 (spec 009). `p_categorias`: omitido = todas; [] = nenhuma.
      resumo_despesas_por_categoria: {
        Args: { p_ate: string; p_categorias?: string[]; p_de: string; p_usuario?: string };
        Returns: {
          ativa: boolean;
          categoria_id: string;
          nome: string;
          /** Nº de despesas. */
          quantidade: number;
          total_geral: number;
          valor: number;
        }[];
      };
      resumo_despesas_por_dia: {
        Args: { p_ate: string; p_categorias?: string[]; p_de: string; p_usuario?: string };
        Returns: {
          data: string;
          quantidade: number;
          valor: number;
        }[];
      };
      /** Só gestor (42501). `quantidade` = nº de despesas. */
      resumo_despesas_por_usuario_nomes: {
        Args: { p_ate: string; p_de: string; p_nomes?: string[] };
        Returns: ResumoUsuarioRow[];
      };
      resumo_por_categoria: {
        Args: { p_ate: string; p_categorias?: string[]; p_de: string; p_usuario?: string };
        Returns: {
          ativa: boolean;
          categoria_id: string;
          nome: string;
          quantidade: number;
          total_geral: number;
          valor: number;
        }[];
      };
      resumo_por_dia: {
        Args: { p_ate: string; p_categorias?: string[]; p_de: string; p_usuario?: string };
        Returns: {
          data: string;
          quantidade: number;
          valor: number;
        }[];
      };
      // Migration 0006 (spec 008): só gestor, senão 42501. Inclui todos os perfis.
      resumo_por_usuario: {
        Args: { p_ate: string; p_categorias?: string[]; p_de: string };
        Returns: ResumoUsuarioRow[];
      };
      resumo_por_usuario_nomes: {
        Args: { p_ate: string; p_de: string; p_nomes?: string[] };
        Returns: ResumoUsuarioRow[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
