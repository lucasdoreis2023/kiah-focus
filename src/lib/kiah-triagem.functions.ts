import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The browser cannot choose another account or impersonate an integration. */
export const triarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Entrada inválida.");
    return input as Record<string, unknown>;
  })
  .handler(async ({ data, context }) => {
    const { triarMensagemInterna, InputSchema } = await import("./kiah-triagem.server");
    const input = InputSchema.parse({
      ...data,
      user_id: context.userId,
      origem: "manual",
      canal: "manual",
      grupo_nome: null,
      grupo_jid: null,
    });
    return triarMensagemInterna(input);
  });
