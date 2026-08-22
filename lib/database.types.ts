// Generado por Supabase MCP (generate_typescript_types) contra el proyecto
// real hsmodrhbwkromoixrxrt (sa-east-1), después de aplicar las migraciones
// de supabase/migrations/. Reemplaza el archivo escrito a mano de VGRP-15.
//
// Para regenerar tras un cambio de esquema:
//   supabase gen types typescript --project-id hsmodrhbwkromoixrxrt > lib/database.types.ts
// (o vía el MCP de Supabase: generate_typescript_types)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          accion: string;
          actor_id: string | null;
          created_at: string;
          entidad: string;
          entidad_id: string | null;
          id: string;
          valor_anterior: Json | null;
          valor_nuevo: Json | null;
        };
        Insert: {
          accion: string;
          actor_id?: string | null;
          created_at?: string;
          entidad: string;
          entidad_id?: string | null;
          id?: string;
          valor_anterior?: Json | null;
          valor_nuevo?: Json | null;
        };
        Update: {
          accion?: string;
          actor_id?: string | null;
          created_at?: string;
          entidad?: string;
          entidad_id?: string | null;
          id?: string;
          valor_anterior?: Json | null;
          valor_nuevo?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          nivel_interes: Database["public"]["Enums"]["nivel_acceso"] | null;
          origen: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          nivel_interes?: Database["public"]["Enums"]["nivel_acceso"] | null;
          origen?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          nivel_interes?: Database["public"]["Enums"]["nivel_acceso"] | null;
          origen?: string | null;
        };
        Relationships: [];
      };
      pagos: {
        Row: {
          created_at: string;
          estado: string;
          id: string;
          monto_ars: number;
          nivel_comprado: Database["public"]["Enums"]["nivel_acceso"];
          payload_raw: Json;
          proveedor: string;
          proveedor_ref: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          estado: string;
          id?: string;
          monto_ars: number;
          nivel_comprado: Database["public"]["Enums"]["nivel_acceso"];
          payload_raw: Json;
          proveedor: string;
          proveedor_ref: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          estado?: string;
          id?: string;
          monto_ars?: number;
          nivel_comprado?: Database["public"]["Enums"]["nivel_acceso"];
          payload_raw?: Json;
          proveedor?: string;
          proveedor_ref?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pagos_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          nivel: Database["public"]["Enums"]["nivel_acceso"];
          nombre: string | null;
          progreso: Json;
          rol: Database["public"]["Enums"]["rol_usuario"];
          telefono: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          nivel?: Database["public"]["Enums"]["nivel_acceso"];
          nombre?: string | null;
          progreso?: Json;
          rol?: Database["public"]["Enums"]["rol_usuario"];
          telefono?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          nivel?: Database["public"]["Enums"]["nivel_acceso"];
          nombre?: string | null;
          progreso?: Json;
          rol?: Database["public"]["Enums"]["rol_usuario"];
          telefono?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      nivel_vigente: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Enums"]["nivel_acceso"];
      };
    };
    Enums: {
      nivel_acceso: "ninguno" | "principiante" | "avanzado";
      rol_usuario: "user" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      nivel_acceso: ["ninguno", "principiante", "avanzado"],
      rol_usuario: ["user", "admin"],
    },
  },
} as const;

// Alias de conveniencia usados por lib/auth/claims.ts y el resto del repo —
// no son parte del output del generador, se agregan acá para no duplicar
// los strings de los enums en otro archivo.
export type NivelAcceso = Database["public"]["Enums"]["nivel_acceso"];
export type RolUsuario = Database["public"]["Enums"]["rol_usuario"];
