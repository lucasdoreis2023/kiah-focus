const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { data } = await supabaseAdmin.from("tarefas").select("id,descricao_limpa,created_at").ilike("descricao_limpa","TESTE %");
console.log(data);
if (data?.length) {
  await supabaseAdmin.from("kiah_envios_log").delete().in("tarefa_id", data.map((d:any)=>d.id));
  const { error } = await supabaseAdmin.from("tarefas").delete().in("id", data.map((d:any)=>d.id));
  console.log("erro delete", error);
}
const { data: rest } = await supabaseAdmin.from("tarefas").select("id").ilike("descricao_limpa","TESTE %");
console.log("restos:", rest?.length);
