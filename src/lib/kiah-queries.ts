import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemLista, Tarefa, TarefaInsert, ItemListaInsert } from "./kiah-types";

export const tarefasPendentesQuery = queryOptions({
  queryKey: ["tarefas", "pendentes"],
  queryFn: async (): Promise<Tarefa[]> => {
    const { data, error } = await supabase
      .from("tarefas")
      .select("*")
      .eq("status", "pendente")
      .order("prazo_estimado", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
});

export const itensListaQuery = queryOptions({
  queryKey: ["itens_lista", "abertos"],
  queryFn: async (): Promise<ItemLista[]> => {
    const { data, error } = await supabase
      .from("itens_lista")
      .select("*")
      .eq("comprado", false)
      .order("categoria", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
});

export async function criarTarefa(input: TarefaInsert) {
  const { error } = await supabase.from("tarefas").insert(input);
  if (error) throw error;
}

export async function concluirTarefa(id: string) {
  const { error } = await supabase
    .from("tarefas")
    .update({ status: "concluida", concluida_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function adiarTarefa(id: string, minutos: number, adiamentosAtuais: number) {
  const novoPrazo = new Date(Date.now() + minutos * 60_000).toISOString();
  const { error } = await supabase
    .from("tarefas")
    .update({
      status: "pendente",
      prazo_estimado: novoPrazo,
      adiamentos: adiamentosAtuais + 1,
      ultimo_alerta_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function descartarTarefa(id: string) {
  const { error } = await supabase
    .from("tarefas")
    .update({ status: "descartada" })
    .eq("id", id);
  if (error) throw error;
}

export async function criarItemLista(input: ItemListaInsert) {
  const { error } = await supabase.from("itens_lista").insert(input);
  if (error) throw error;
}

export async function marcarItemComprado(id: string) {
  const { error } = await supabase
    .from("itens_lista")
    .update({ comprado: true, comprado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function removerItemLista(id: string) {
  const { error } = await supabase.from("itens_lista").delete().eq("id", id);
  if (error) throw error;
}

export async function removerItensLista(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("itens_lista").delete().in("id", ids);
  if (error) throw error;
}

export async function removerTodosItensLista() {
  const { error } = await supabase
    .from("itens_lista")
    .delete()
    .not("id", "is", null);
  if (error) throw error;
}

export async function removerTarefa(id: string) {
  const { error } = await supabase.from("tarefas").delete().eq("id", id);
  if (error) throw error;
}

export async function removerTarefas(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("tarefas").delete().in("id", ids);
  if (error) throw error;
}

export async function removerTodasTarefasPendentes() {
  const { error } = await supabase
    .from("tarefas")
    .delete()
    .eq("status", "pendente");
  if (error) throw error;
}
