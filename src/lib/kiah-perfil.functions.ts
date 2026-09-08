import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Só dígitos, com DDI. Se o usuário digitar sem 55, prefixa 55 (Brasil). */
function normalizarNumero(bruto: string): string {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55")) return digitos;
  // BR sem DDI: DDD + número (10 ou 11 dígitos)
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

export const obterMeuPerfil = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, nome, whatsapp_numero, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const salvarMeuWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { numero: string }) => {
    if (typeof input?.numero !== "string") throw new Error("Número inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const numero = normalizarNumero(data.numero);
    if (!numero) throw new Error("Informe um número válido.");
    if (numero.length < 12 || numero.length > 15) {
      throw new Error(
        "Número fora do padrão. Use DDD + número (ex: 11987654321).",
      );
    }

    // Unicidade: já vinculado a outro usuário?
    const { data: existente, error: erroBusca } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("whatsapp_numero", numero)
      .neq("id", context.userId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (existente) {
      throw new Error(
        "Este WhatsApp já está vinculado a outra conta Kiah.",
      );
    }

    const { error } = await context.supabase
      .from("profiles")
      .update({ whatsapp_numero: numero })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return { numero };
  });

export const removerMeuWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ whatsapp_numero: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ───────────────────────── Preferências de alerta ─────────────────────────

export type PrefsAlerta = {
  alertas_pausados: boolean;
  quiet_start: number;
  quiet_end: number;
  max_proativos_dia: number;
  intervalo_min_minutos: number;
  resumo_manha: string;
  resumo_meiodia: string;
  resumo_noite: string;
  cobrar_fim_de_semana: boolean;
};

const PADRAO: PrefsAlerta = {
  alertas_pausados: false,
  quiet_start: 21,
  quiet_end: 7,
  max_proativos_dia: 6,
  intervalo_min_minutos: 90,
  resumo_manha: "07:30",
  resumo_meiodia: "12:30",
  resumo_noite: "18:30",
  cobrar_fim_de_semana: false,
};

export const obterMinhasPreferencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrefsAlerta> => {
    const { data, error } = await context.supabase
      .from("preferencias_alerta")
      .select(
        "alertas_pausados, quiet_start, quiet_end, max_proativos_dia, intervalo_min_minutos, resumo_manha, resumo_meiodia, resumo_noite, cobrar_fim_de_semana",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return PADRAO;
    return {
      ...PADRAO,
      ...data,
      resumo_manha: String(data.resumo_manha).slice(0, 5),
      resumo_meiodia: String(data.resumo_meiodia).slice(0, 5),
      resumo_noite: String(data.resumo_noite).slice(0, 5),
    };
  });

function hhmm(v: unknown, padrao: string): string {
  const s = String(v ?? "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : padrao;
}

export const salvarMinhasPreferencias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<PrefsAlerta>) => {
    if (!input || typeof input !== "object") throw new Error("Entrada inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const limpo = {
      user_id: context.userId,
      alertas_pausados: !!data.alertas_pausados,
      quiet_start: Math.min(23, Math.max(0, Number(data.quiet_start ?? 21))),
      quiet_end: Math.min(23, Math.max(0, Number(data.quiet_end ?? 7))),
      max_proativos_dia: Math.min(20, Math.max(1, Number(data.max_proativos_dia ?? 6))),
      intervalo_min_minutos: Math.min(
        480,
        Math.max(15, Number(data.intervalo_min_minutos ?? 90)),
      ),
      resumo_manha: hhmm(data.resumo_manha, "07:30"),
      resumo_meiodia: hhmm(data.resumo_meiodia, "12:30"),
      resumo_noite: hhmm(data.resumo_noite, "18:30"),
      cobrar_fim_de_semana: !!data.cobrar_fim_de_semana,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("preferencias_alerta")
      .upsert(limpo, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
