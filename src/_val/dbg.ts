const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const uid = "043de90d-bf75-4a7e-ae04-cc1b1cb0edd1";
const { data, error } = await supabaseAdmin.from("tarefas").insert({ user_id: uid, descricao_limpa: "TESTE dbg", confirmado: true }).select("id").single();
console.log("novo", data, error);
const { data: p, error: e2 } = await supabaseAdmin.from("tarefas").select("id").eq("user_id", uid).in("status", ["pendente","adiada"]);
console.log("pendentes", p?.length, e2, p?.some((x:any)=>x.id===data.id));
const { resolverPorPrefixo } = await import("@/lib/kiah-comandos.server");
console.log(await resolverPorPrefixo(supabaseAdmin, uid, data.id.slice(0,6)));
await supabaseAdmin.from("tarefas").delete().eq("id", data.id);
