import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint — chamado pelo pg_cron em intervalos curtos (ex: a cada 5 min).
 * Varre `tarefas` pendentes e, respeitando cadencia_alerta_minutos, dispara
 * mensagens persistentes no WhatsApp do Lucas.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/alertas-persistentes")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enviarWhatsApp } = await import("@/lib/kiah-whatsapp.server");

        const agora = new Date();
        const { data: tarefas, error } = await supabaseAdmin
          .from("tarefas")
          .select("*")
          .eq("status", "pendente")
          .order("prazo_estimado", { ascending: true, nullsFirst: false });

        if (error) return json({ ok: false, error: error.message }, 500);

        let enviados = 0;
        const detalhes: Array<{ id: string; motivo: string }> = [];

        for (const t of tarefas ?? []) {
          const cadenciaMin = t.cadencia_alerta_minutos ?? 60;
          const ultimo = t.ultimo_alerta_em ? new Date(t.ultimo_alerta_em) : null;
          const minutosDesde = ultimo
            ? (agora.getTime() - ultimo.getTime()) / 60000
            : Infinity;

          if (minutosDesde < cadenciaMin) continue;

          const prazoTxt = t.prazo_estimado
            ? new Date(t.prazo_estimado).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short",
              })
            : "sem prazo";

          const prefixo =
            t.tipo_demanda === "tarefa_urgente"
              ? "🔥 URGENTE"
              : t.tipo_demanda === "academico"
                ? "📘 ACADÊMICO"
                : "📝 LEMBRETE";

          const adiSuf = t.adiamentos > 2 ? `  ⚠️ (adiada ${t.adiamentos}x)` : "";

          try {
            await enviarWhatsApp(
              `${prefixo}: ${t.descricao_limpa}\n⏰ Prazo: ${prazoTxt}${adiSuf}\n\nResponda "feito ${t.id.slice(0, 6)}" ao concluir.`,
            );
            await supabaseAdmin
              .from("tarefas")
              .update({ ultimo_alerta_em: agora.toISOString() })
              .eq("id", t.id);
            enviados++;
            detalhes.push({ id: t.id, motivo: "enviado" });
          } catch (e) {
            detalhes.push({
              id: t.id,
              motivo: `falha: ${e instanceof Error ? e.message : String(e)}`,
            });
          }
        }

        return json({ ok: true, verificadas: tarefas?.length ?? 0, enviados, detalhes });
      },
    },
  },
});
