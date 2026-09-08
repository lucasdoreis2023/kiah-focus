const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { tentarComando } = await import("@/lib/kiah-comandos.server");
const uid = "043de90d-bf75-4a7e-ae04-cc1b1cb0edd1";
const mk = async (d: string) => {
  const { data, error } = await supabaseAdmin.from("tarefas").insert({ user_id: uid, descricao_limpa: d, confirmado: true, contexto: { _teste: true } }).select("id").single();
  if (error) throw error; return data.id as string;
};
const a = await mk("TESTE validacao feito"); const b = await mk("TESTE validacao deletar");
console.log("ids", a, b);
console.log("feito:", await tentarComando(`feito ${a.slice(0,6)}`), uid);
console.log("deletar:", await tentarComando(`deletar ${b.slice(0,6)}`), uid);
console.log("prefixo curto ambiguo:", await tentarComando("feito 0"), uid);
console.log("sem id:", await tentarComando("feito"), uid);
const { data } = await supabaseAdmin.from("tarefas").select("id,status").in("id",[a,b]);
console.log(data);
await supabaseAdmin.from("tarefas").delete().in("id",[a,b]);
await supabaseAdmin.from("kiah_envios_log").delete().in("tarefa_id",[a,b]);
console.log("limpo");
