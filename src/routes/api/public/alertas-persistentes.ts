import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron do Kiah — roda a cada 15 min.
 *
 * Política anti-spam:
 *  - Só tarefas CONFIRMADAS na Caixa de Entrada geram WhatsApp.
 *  - Mensagens proativas saem apenas nas janelas de resumo (07:30 / 12:30 /
 *    18:30 BRT por padrão), consolidadas por tema, uma única mensagem.
 *  - Fora das janelas, só urgência real (prazo nas próximas 2h ou tarefa
 *    urgente vencida há menos de 24h).
 *  - Limites: 6 mensagens proativas/dia, 90 min entre elas, silêncio
 *    21:00–07:00, 3 alertas no total por tarefa (2 por dia), 1 único alerta
 *    para tarefa vinda de grupo, nada para vencidas há mais de 7 dias
 *    (viram apenas uma contagem no resumo da manhã).
 *  - Também varre diálogos ociosos e manda o resultado para a Caixa de
 *    Entrada, em silêncio.
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

      GET: async () => json({ ok: true, hint: "Cron do Kiah. Use POST." }),

      POST: async ({ request }) => {
        const { integrationAuthorized } = await import("@/lib/kiah-integration-auth.server");
        if (!integrationAuthorized(request, process.env.KIAH_CRON_SECRET)) {
          return json({ ok: false, error: "Não autorizado" }, 401);
        }
        let simular = false;
        try {
          const body = (await request.json()) as { simular?: boolean } | null;
          simular = body?.simular === true;
        } catch {
          simular = false;
        }
        const { executarCicloAlertas } = await import("@/lib/kiah-ciclo.server");
        const resultado = await executarCicloAlertas({ simular });
        return json(resultado);
      },
    },
  },
});
