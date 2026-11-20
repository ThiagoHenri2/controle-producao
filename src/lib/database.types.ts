/**
 * Tipos do banco (schema `public`), no formato do gerador do supabase-js v2.
 *
 * ESCRITO À MÃO a partir de `supabase/migrations/0001_schema_inicial.sql`,
 * porque a CLI ainda não está autenticada neste ambiente. Ajustes manuais em
 * relação ao gerador:
 *   - `profiles.role` é `'admin' | 'user'` (o gerador daria `string`, pois é um CHECK);
 *   - `lancamentos.Insert.valor_unitario` é opcional (o trigger
 *     `lancamentos_preco_snapshot` copia o preço da categoria);
 *   - `lancamentos.valor_total` (coluna gerada) não aparece em Insert/Update.
 *
 * Para regenerar via CLI no futuro (depois de `npx supabase login`):
 *   npx supabase gen types typescript --project-id <ref-do-projeto> --schema public > src/lib/database.types.ts
 * e reaplique os ajustes acima (ou mantenha-os num tipo derivado).
 * Atualize este arquivo sempre que uma nova migration mudar o schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRole = 'admin' | 'user';

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
        };
        Insert: {
          ativa?: boolean;
          created_at?: string;
          id?: string;
          nome: string;
          updated_at?: string;
          user_id?: string;
          valor_unitario: number;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
          user_id?: string;
          valor_unitario?: number;
        };
        Relationships: [];
      };
      lancamentos: {
        Row: {
          categoria_id: string;
          created_at: string;
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
          id: string;
          nome: string;
          role: ProfileRole;
          username: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          id: string;
          nome: string;
          role?: ProfileRole;
          username: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
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
      is_admin: { Args: never; Returns: boolean };
      is_ativo: { Args: never; Returns: boolean };
      // Migrations 0003_resumo.sql e 0005_resumo_filtro_categorias.sql (spec 005).
      // `p_categorias` omitido/null = todas as categorias.
      // `bigint`/`numeric` → number; `date`/`uuid` → string.
      resumo_por_categoria: {
        Args: { p_ate: string; p_categorias?: string[]; p_de: string };
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
        Args: { p_ate: string; p_categorias?: string[]; p_de: string };
        Returns: {
          data: string;
          quantidade: number;
          valor: number;
        }[];
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
