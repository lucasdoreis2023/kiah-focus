import type { Database } from "@/integrations/supabase/types";

export type Tarefa = Database["public"]["Tables"]["tarefas"]["Row"];
export type TarefaInsert = Database["public"]["Tables"]["tarefas"]["Insert"];
export type ItemLista = Database["public"]["Tables"]["itens_lista"]["Row"];
export type ItemListaInsert = Database["public"]["Tables"]["itens_lista"]["Insert"];

export type TipoDemanda = Database["public"]["Enums"]["tipo_demanda"];
export type OrigemDemanda = Database["public"]["Enums"]["origem_demanda"];
export type StatusDemanda = Database["public"]["Enums"]["status_demanda"];

export const CATEGORIAS_LISTA = [
  "Supermercado",
  "Papelaria",
  "Farmácia",
  "Casa",
  "Outros",
] as const;

export const TIPOS_TAREFA: { value: TipoDemanda; label: string; cadencia: number }[] = [
  { value: "tarefa_urgente", label: "Urgente", cadencia: 30 },
  { value: "academico", label: "Acadêmico", cadencia: 30 },
  { value: "tarefa_rotina", label: "Rotina", cadencia: 120 },
  { value: "lista_compras", label: "Compra", cadencia: 0 },
];
