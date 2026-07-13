import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listarMeusGrupos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("grupos_whatsapp")
      .select("id, grupo_jid, grupo_nome, permitido, detectado_em, ultima_mensagem_em")
      .eq("user_id", context.userId)
      .order("ultima_mensagem_em", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const alternarGrupoPermitido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; permitido: boolean }) => {
    if (typeof input?.id !== "string" || typeof input?.permitido !== "boolean") {
      throw new Error("Entrada inválida.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("grupos_whatsapp")
      .update({ permitido: data.permitido })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string") throw new Error("id inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("grupos_whatsapp")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sincronizarGruposEvolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listarGruposEvolution } = await import("@/lib/kiah-whatsapp.server");
    const grupos = await listarGruposEvolution();
    if (grupos.length === 0) return { ok: true, total: 0, novos: 0 };

    const agora = new Date().toISOString();
    const rows = grupos.map((g) => ({
      user_id: context.userId,
      grupo_jid: g.id,
      grupo_nome: g.subject ?? null,
      detectado_em: agora,
      ultima_mensagem_em: agora,
    }));

    // Descobre quais já existiam para reportar "novos"
    const { data: existentes } = await context.supabase
      .from("grupos_whatsapp")
      .select("grupo_jid")
      .eq("user_id", context.userId)
      .in("grupo_jid", rows.map((r) => r.grupo_jid));
    const jaTinha = new Set((existentes ?? []).map((r) => r.grupo_jid));

    const { error } = await context.supabase
      .from("grupos_whatsapp")
      .upsert(rows, { onConflict: "user_id,grupo_jid", ignoreDuplicates: false });
    if (error) throw new Error(error.message);

    return {
      ok: true,
      total: rows.length,
      novos: rows.filter((r) => !jaTinha.has(r.grupo_jid)).length,
    };
  });

