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
