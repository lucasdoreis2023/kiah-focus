import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint — chamado pelo pg_cron a cada 5 min.
 * Para cada tarefa pendente cuja cadência venceu, manda alerta no WhatsApp
 * do dono (profiles.whatsapp_numero).
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
          .not("user_id", "is", null);
        if (error) return json({ ok: false, error: error.message }, 500);

        // Carregar donos → número de WhatsApp
        const userIds = [...new Set((tarefas ?? []).map((t) => t.user_id!))];
        const numeroPorUsuario = new Map<string, string>();
        if (userIds.length) {
          const { data: perfis } = await supabaseAdmin
            .from("profiles")
            .select("id, whatsapp_numero")
            .in("id", userIds);
          for (const p of perfis ?? []) {
            if (p.whatsapp_numero) numeroPorUsuario.set(p.id, p.whatsapp_numero);
          }
        }

        let enviados = 0;
        const detalhes: Array<{ id: string; motivo: string }> = [];

        for (const t of tarefas ?? []) {
          const numero = numeroPorUsuario.get(t.user_id!);
          if (!numero) {
            detalhes.push({ id: t.id, motivo: "sem_whatsapp_vinculado" });
            continue;
          }

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
              `${prefixo}: ${t.descricao_limpa}\n⏰ Prazo: ${prazoTxt}${adiSuf}\n\nResponda "feito ${t.id.slice(0, 6)}" ao concluir · "adiar ${t.id.slice(0, 6)} 30" · "desisto ${t.id.slice(0, 6)}"`,
              numero,
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
