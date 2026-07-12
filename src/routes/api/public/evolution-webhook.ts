import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da Evolution API.
 * Configurar na Evolution para POST em:
 *   https://<host>/api/public/evolution-webhook
 *
 * Aceita eventos MESSAGES_UPSERT e triaga apenas as mensagens
 * cujo remetente é o número do Lucas (KIAH_WHATSAPP_NUMERO).
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

type EvolutionPayload = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: Record<string, unknown>;
    messageType?: string;
    pushName?: string;
  };
};

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async () => json({ ok: true, hint: "Evolution webhook ativo. Use POST." }),

      POST: async ({ request }) => {
        let payload: EvolutionPayload;
        try {
          payload = (await request.json()) as EvolutionPayload;
        } catch {
          return json({ ok: false, error: "JSON inválido" }, 400);
        }

        const evento = payload.event ?? "";
        // Só nos interessa mensagem nova
        if (!/messages[._-]upsert/i.test(evento)) {
          return json({ ok: true, ignorado: `evento ${evento}` });
        }

        const d = payload.data;
        const jid = d?.key?.remoteJid ?? "";
        const fromMe = d?.key?.fromMe === true;
        if (fromMe) return json({ ok: true, ignorado: "fromMe" });

        const { jidParaNumero, enviarWhatsApp, baixarMidiaBase64 } = await import(
          "@/lib/kiah-whatsapp.server"
        );

        const numeroRemetente = jidParaNumero(jid);
        const numeroLucas = process.env.KIAH_WHATSAPP_NUMERO ?? "";
        if (numeroRemetente !== numeroLucas) {
          return json({ ok: true, ignorado: `remetente ${numeroRemetente}` });
        }

        const msg = d?.message ?? {};
        // Extrair texto direto
        let texto = "";
        if (typeof (msg as any).conversation === "string") {
          texto = (msg as any).conversation;
        } else if (typeof (msg as any).extendedTextMessage?.text === "string") {
          texto = (msg as any).extendedTextMessage.text;
        } else if (typeof (msg as any).imageMessage?.caption === "string") {
          texto = (msg as any).imageMessage.caption;
        } else if (typeof (msg as any).audioMessage?.caption === "string") {
          texto = (msg as any).audioMessage.caption;
        }

        // Detectar mídia
        const temImagem = !!(msg as any).imageMessage;
        const temAudio = !!(msg as any).audioMessage;

        let imagem_base64: string | undefined;
        let imagem_mime: string | undefined;
        let audio_base64: string | undefined;
        let audio_format: "ogg" | "mp3" | "wav" | "m4a" | "webm" | undefined;

        try {
          if (temImagem || temAudio) {
            const mid = await baixarMidiaBase64({
              key: {
                remoteJid: jid,
                id: d?.key?.id ?? "",
                fromMe: false,
              },
              message: msg,
            });
            if (temImagem) {
              imagem_base64 = mid.base64;
              imagem_mime = mid.mimetype || "image/jpeg";
            } else if (temAudio) {
              audio_base64 = mid.base64;
              // WhatsApp geralmente ogg/opus
              const mt = (mid.mimetype || "").toLowerCase();
              audio_format =
                mt.includes("mp3") ? "mp3"
                : mt.includes("wav") ? "wav"
                : mt.includes("m4a") || mt.includes("mp4") ? "m4a"
                : mt.includes("webm") ? "webm"
                : "ogg";
            }
          }
        } catch (e) {
          console.error("[kiah-webhook] erro baixando mídia", e);
          await enviarWhatsApp(
            "⚠️ Kiah recebeu sua mídia mas não consegui baixar pela Evolution. Tenta reenviar como texto?",
          ).catch(() => {});
          return json({ ok: false, error: "download_midia_falhou" }, 200);
        }

        if (!texto && !imagem_base64 && !audio_base64) {
          return json({ ok: true, ignorado: "mensagem sem conteúdo utilizável" });
        }

        try {
          const { triarMensagem } = await import("@/lib/kiah-triagem.functions");
          const res = await triarMensagem({
            data: {
              texto,
              origem: "whatsapp_pessoal",
              imagem_base64,
              imagem_mime,
              audio_base64,
              audio_format,
            },
          });

          // Confirmação curta ao Lucas
          const resumo =
            res.classe === "ruido"
              ? "🫧 Recebi, mas nada acionável — arquivado como ruído."
              : res.classe === "lista_compras"
                ? `🛒 Adicionei ${res.criados} item(ns) na lista de compras.`
                : res.classe === "tarefa_urgente"
                  ? `🔥 Tarefa URGENTE registrada: ${res.resultado.descricao_limpa}`
                  : res.classe === "academico"
                    ? `📘 Tarefa acadêmica registrada: ${res.resultado.descricao_limpa}`
                    : `📝 Tarefa registrada: ${res.resultado.descricao_limpa}`;

          await enviarWhatsApp(resumo).catch((e) =>
            console.error("[kiah-webhook] envio confirmação falhou", e),
          );

          return json({ ok: true, ...res });
        } catch (e) {
          const msgErr = e instanceof Error ? e.message : String(e);
          console.error("[kiah-webhook] triagem falhou", msgErr);
          await enviarWhatsApp(
            `⚠️ Kiah recebeu mas travou na triagem: ${msgErr.slice(0, 140)}`,
          ).catch(() => {});
          return json({ ok: false, error: msgErr }, 200);
        }
      },
    },
  },
});
