export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      grupos_whatsapp: {
        Row: {
          created_at: string
          detectado_em: string
          grupo_jid: string
          grupo_nome: string | null
          id: string
          permitido: boolean
          temas: string[]
          ultima_mensagem_em: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detectado_em?: string
          grupo_jid: string
          grupo_nome?: string | null
          id?: string
          permitido?: boolean
          temas?: string[]
          ultima_mensagem_em?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detectado_em?: string
          grupo_jid?: string
          grupo_nome?: string | null
          id?: string
          permitido?: boolean
          temas?: string[]
          ultima_mensagem_em?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      itens_lista: {
        Row: {
          categoria: string
          comprado: boolean
          comprado_em: string | null
          confirmado: boolean
          created_at: string
          descricao: string
          expira_em: string | null
          id: string
          origem: Database["public"]["Enums"]["origem_demanda"]
          origem_grupo_jid: string | null
          origem_grupo_nome: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          categoria?: string
          comprado?: boolean
          comprado_em?: string | null
          confirmado?: boolean
          created_at?: string
          descricao: string
          expira_em?: string | null
          id?: string
          origem?: Database["public"]["Enums"]["origem_demanda"]
          origem_grupo_jid?: string | null
          origem_grupo_nome?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          categoria?: string
          comprado?: boolean
          comprado_em?: string | null
          confirmado?: boolean
          created_at?: string
          descricao?: string
          expira_em?: string | null
          id?: string
          origem?: Database["public"]["Enums"]["origem_demanda"]
          origem_grupo_jid?: string | null
          origem_grupo_nome?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      kiah_envios_log: {
        Row: {
          enviado_em: string
          id: string
          metadados: Json | null
          motivo: string | null
          tarefa_id: string | null
          tipo_envio: string
          user_id: string
        }
        Insert: {
          enviado_em?: string
          id?: string
          metadados?: Json | null
          motivo?: string | null
          tarefa_id?: string | null
          tipo_envio: string
          user_id: string
        }
        Update: {
          enviado_em?: string
          id?: string
          metadados?: Json | null
          motivo?: string | null
          tarefa_id?: string | null
          tipo_envio?: string
          user_id?: string
        }
        Relationships: []
      }
      mensagens_dialogo: {
        Row: {
          criado_em: string
          from_me: boolean
          id: string
          jid: string
          processado_em: string | null
          push_name: string | null
          texto: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          from_me?: boolean
          id?: string
          jid: string
          processado_em?: string | null
          push_name?: string | null
          texto: string
          user_id: string
        }
        Update: {
          criado_em?: string
          from_me?: boolean
          id?: string
          jid?: string
          processado_em?: string | null
          push_name?: string | null
          texto?: string
          user_id?: string
        }
        Relationships: []
      }
      preferencias_alerta: {
        Row: {
          alertas_pausados: boolean
          cobrar_fim_de_semana: boolean
          created_at: string
          intervalo_min_minutos: number
          max_proativos_dia: number
          quiet_end: number
          quiet_start: number
          resumo_manha: string
          resumo_meiodia: string
          resumo_noite: string
          temas_padrao_grupos: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          alertas_pausados?: boolean
          cobrar_fim_de_semana?: boolean
          created_at?: string
          intervalo_min_minutos?: number
          max_proativos_dia?: number
          quiet_end?: number
          quiet_start?: number
          resumo_manha?: string
          resumo_meiodia?: string
          resumo_noite?: string
          temas_padrao_grupos?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          alertas_pausados?: boolean
          cobrar_fim_de_semana?: boolean
          created_at?: string
          intervalo_min_minutos?: number
          max_proativos_dia?: number
          quiet_end?: number
          quiet_start?: number
          resumo_manha?: string
          resumo_meiodia?: string
          resumo_noite?: string
          temas_padrao_grupos?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string | null
          updated_at: string
          whatsapp_numero: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome?: string | null
          updated_at?: string
          whatsapp_numero?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          updated_at?: string
          whatsapp_numero?: string | null
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          adiamentos: number
          alertas_dia_ref: string | null
          alertas_enviados: number
          alertas_hoje: number
          cadencia_alerta_minutos: number
          canal: string
          concluida_em: string | null
          confirmado: boolean
          contexto: Json | null
          created_at: string
          descricao_limpa: string
          descricao_norm: string | null
          id: string
          id_curto: string | null
          origem: Database["public"]["Enums"]["origem_demanda"]
          prazo_estimado: string | null
          recebida_em: string
          silenciada_ate: string | null
          status: Database["public"]["Enums"]["status_demanda"]
          subtipo: string | null
          sugerida_em: string | null
          tipo_demanda: Database["public"]["Enums"]["tipo_demanda"]
          ultimo_alerta_em: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adiamentos?: number
          alertas_dia_ref?: string | null
          alertas_enviados?: number
          alertas_hoje?: number
          cadencia_alerta_minutos?: number
          canal?: string
          concluida_em?: string | null
          confirmado?: boolean
          contexto?: Json | null
          created_at?: string
          descricao_limpa: string
          descricao_norm?: string | null
          id?: string
          id_curto?: string | null
          origem?: Database["public"]["Enums"]["origem_demanda"]
          prazo_estimado?: string | null
          recebida_em?: string
          silenciada_ate?: string | null
          status?: Database["public"]["Enums"]["status_demanda"]
          subtipo?: string | null
          sugerida_em?: string | null
          tipo_demanda?: Database["public"]["Enums"]["tipo_demanda"]
          ultimo_alerta_em?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adiamentos?: number
          alertas_dia_ref?: string | null
          alertas_enviados?: number
          alertas_hoje?: number
          cadencia_alerta_minutos?: number
          canal?: string
          concluida_em?: string | null
          confirmado?: boolean
          contexto?: Json | null
          created_at?: string
          descricao_limpa?: string
          descricao_norm?: string | null
          id?: string
          id_curto?: string | null
          origem?: Database["public"]["Enums"]["origem_demanda"]
          prazo_estimado?: string | null
          recebida_em?: string
          silenciada_ate?: string | null
          status?: Database["public"]["Enums"]["status_demanda"]
          subtipo?: string | null
          sugerida_em?: string | null
          tipo_demanda?: Database["public"]["Enums"]["tipo_demanda"]
          ultimo_alerta_em?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_eventos_processados: {
        Row: {
          message_id: string
          processado_em: string
        }
        Insert: {
          message_id: string
          processado_em?: string
        }
        Update: {
          message_id?: string
          processado_em?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reivindicar_dados_orfaos: { Args: { _whatsapp: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      origem_demanda:
        | "whatsapp_pessoal"
        | "whatsapp_terceiros"
        | "konecta_i"
        | "manual"
      status_demanda: "pendente" | "concluida" | "adiada" | "descartada"
      tipo_demanda:
        | "tarefa_urgente"
        | "tarefa_rotina"
        | "lista_compras"
        | "academico"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      origem_demanda: [
        "whatsapp_pessoal",
        "whatsapp_terceiros",
        "konecta_i",
        "manual",
      ],
      status_demanda: ["pendente", "concluida", "adiada", "descartada"],
      tipo_demanda: [
        "tarefa_urgente",
        "tarefa_rotina",
        "lista_compras",
        "academico",
      ],
    },
  },
} as const
