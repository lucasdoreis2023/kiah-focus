const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { executarCicloAlertas } = await import("@/lib/kiah-ciclo.server");
const r = await executarCicloAlertas({ simular: true });
console.log(JSON.stringify(r.relatorio, null, 1), "envios:", r.envios);
const { count } = await supabaseAdmin.from("tarefas").select("id", { count: "exact", head: true }).eq("status","pendente").eq("confirmado", false);
console.log("pendentes nao confirmadas (nunca elegiveis):", count);
