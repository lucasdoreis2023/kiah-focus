import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Chamada no primeiro login:
 *  - migra tarefas/itens_lista sem dono para o usuário atual
 *  - vincula o número do WhatsApp do Kiah ao perfil (se ainda não foi reivindicado)
 * Segurança: a função SQL exige auth.uid() e o número vem só do backend (env),
 * nunca do cliente.
 */
export const reivindicarDadosOrfaos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).optional().parse(input))
  .handler(async ({ context }) => {
    const whatsapp = process.env.KIAH_WHATSAPP_NUMERO ?? "";
    const { data, error } = await context.supabase.rpc("reivindicar_dados_orfaos", {
      _whatsapp: whatsapp,
    });
    if (error) throw new Error(error.message);
    return data as {
      tarefas_migradas: number;
      itens_migrados: number;
      whatsapp_vinculado: boolean;
    };
  });
