// Generado a mano — reemplazar con
// `supabase gen types typescript --linked > lib/database.types.ts`
// en cuanto el proyecto esté vinculado. Verificar que coincida exactamente
// con lo que genere el CLI (nombres de columnas, nullability, tipos de
// enums) antes de confiar en este archivo para nada crítico.
//
// Corresponde a las migraciones:
//   - supabase/migrations/20260822035923_init_plataforma.sql
//   - supabase/migrations/20260822035924_leads.sql
// (VGRP-15). Si esas migraciones cambian, este archivo queda desactualizado
// hasta que se regenere.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type NivelAcceso = "ninguno" | "principiante" | "avanzado";
export type RolUsuario = "user" | "admin";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          nombre: string | null;
          telefono: string | null;
          nivel: NivelAcceso;
          rol: RolUsuario;
          progreso: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          nombre?: string | null;
          telefono?: string | null;
          nivel?: NivelAcceso;
          rol?: RolUsuario;
          progreso?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          nombre?: string | null;
          telefono?: string | null;
          nivel?: NivelAcceso;
          rol?: RolUsuario;
          progreso?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedSchema: "auth";
            referencedColumns: ["id"];
          },
        ];
      };
      pagos: {
        Row: {
          id: string;
          user_id: string;
          proveedor: string;
          proveedor_ref: string;
          nivel_comprado: NivelAcceso;
          monto_ars: number;
          estado: string;
          payload_raw: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          proveedor: string;
          proveedor_ref: string;
          nivel_comprado: NivelAcceso;
          monto_ars: number;
          estado: string;
          payload_raw: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          proveedor?: string;
          proveedor_ref?: string;
          nivel_comprado?: NivelAcceso;
          monto_ars?: number;
          estado?: string;
          payload_raw?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pagos_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedSchema: "public";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          accion: string;
          entidad: string;
          entidad_id: string | null;
          valor_anterior: Json | null;
          valor_nuevo: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          accion: string;
          entidad: string;
          entidad_id?: string | null;
          valor_anterior?: Json | null;
          valor_nuevo?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          accion?: string;
          entidad?: string;
          entidad_id?: string | null;
          valor_anterior?: Json | null;
          valor_nuevo?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedSchema: "public";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          email: string;
          nivel_interes: NivelAcceso | null;
          origen: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          nivel_interes?: NivelAcceso | null;
          origen?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          nivel_interes?: NivelAcceso | null;
          origen?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      nivel_vigente: {
        Args: { p_user_id: string };
        Returns: NivelAcceso;
      };
    };
    Enums: {
      nivel_acceso: NivelAcceso;
      rol_usuario: RolUsuario;
    };
    CompositeTypes: Record<string, never>;
  };
};
