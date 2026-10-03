import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da Evolution API.
 *
 * Roteamento:
 *  1. Aceita apenas MESSAGES_UPSERT e deduplica por message_id.
 *  2. Distingue três atores: número da instância (bot), número do DONO
 *     (profiles.whatsapp_numero) e contato terceiro.
 *  3. Mensagem direta do dono → comando (ou triagem, se não for comando).
 *  4. Mensagem de terceiro → buffer de diálogo (silêncio total).
 *  5. Grupo → só se permitido E se casar com os temas monitorados.
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
    key?: { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string };
    message?: Record<string, unknown>;
    messageType?: string;
    pushName?: string;
    participant?: string;
    sender?: string;
  };
};

function ehJidGrupo(jid: string): boolean {
  return jid.endsWith("@g.us");
}

function normalizarNumeroCadastro(bruto: string): string {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55")) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

function extrairTextoMensagem(msg: Record<string, unknown>): string {
  const m = msg as any;
  if (typeof m.conversation === "string") return m.conversation;
  if (typeof m.extendedTextMessage?.text === "string") return m.extendedTextMessage.text;
  if (typeof m.imageMessage?.caption === "string") return m.imageMessage.caption;
  if (typeof m.audioMessage?.caption === "string") return m.audioMessage.caption;
  if (typeof m.documentMessage?.caption === "string") return m.documentMessage.caption;
  if (typeof m.documentMessage?.fileName === "string") return m.documentMessage.fileName;
  if (typeof m.videoMessage?.caption === "string") return m.videoMessage.caption;
  if (typeof m.locationMessage?.name === "string") return m.locationMessage.name;
  if (typeof m.locationMessage?.address === "string") return m.locationMessage.address;
  return "";
}

/** Normaliza para comparação de tema: sem acento, minúsculo. */
function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function casaComTemas(texto: string, temas: string[]): string | null {
  const alvo = semAcento(texto);
  for (const tema of temas) {
    const t = semAcento(tema).trim();
    if (!t) continue;
    if (alvo.includes(t)) return tema;
  }
  return null;
}

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async () => json({ ok: true, hint: "Evolution webhook ativo. Use POST." }),

      POST: async ({ request }) => {
        const { integrationAuthorized } = await import("@/lib/kiah-integration-auth.server");
        if (!integrationAuthorized(request, process.env.KIAH_WEBHOOK_SECRET)) {
          return json({ ok: false, error: "Não autorizado" }, 401);
        }
        let payload: EvolutionPayload;
        try {
          payload = (await request.json()) as EvolutionPayload;
        } catch {
          return json({ ok: false, error: "JSON inválido" }, 400);
        }

        if (
          !process.env.EVOLUTION_INSTANCE ||
          payload.instance !== process.env.EVOLUTION_INSTANCE
        ) {
          return json({ ok: false, error: "Instância inválida" }, 403);
        }
        const evento = payload.event ?? "";
        if (!/messages[._-]upsert/i.test(evento)) {
          return json({ ok: true, ignorado: `evento ${evento}` });
        }

        const d = payload.data;
        const jid = d?.key?.remoteJid ?? "";
        const fromMe = d?.key?.fromMe === true;
        const messageId = d?.key?.id ?? "";

        const { jidParaNumero, numeroKiah, enviarWhatsApp, baixarMidiaBase64 } =
          await import("@/lib/kiah-whatsapp.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Dedupe de retentativas da Evolution
        if (messageId) {
          const { error: dupErr } = await supabaseAdmin
            .from("webhook_eventos_processados")
            .insert({ message_id: messageId });
          if (dupErr) return json({ ok: true, ignorado: "duplicado" });
        }

        const numeroInstancia = normalizarNumeroCadastro(numeroKiah());

        async function perfilPorNumero(numero: string) {
          if (!numero) return null;
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id, whatsapp_numero")
            .eq("whatsapp_numero", numero)
            .limit(1)
            .maybeSingle();
          return data;
        }

        const msg = d?.message ?? {};
        const texto = extrairTextoMensagem(msg);
        const numeroRemetente = jidParaNumero(jid);
        const perfilInstancia = await perfilPorNumero(numeroInstancia);

        // ─────────────────────── GRUPOS ───────────────────────
        if (ehJidGrupo(jid)) {
          if (!perfilInstancia?.id) return json({ ok: true, ignorado: "grupo_sem_dono" });

          const nomeGrupo =
            (d?.message as any)?.groupName ??
            (d as any)?.groupMetadata?.subject ??
            d?.pushName ??
            null;

          const { data: existente } = await supabaseAdmin
            .from("grupos_whatsapp")
            .select("id, permitido, grupo_nome, temas")
            .eq("user_id", perfilInstancia.id)
            .eq("grupo_jid", jid)
            .maybeSingle();

          if (!existente) {
            await supabaseAdmin.from("grupos_whatsapp").insert({
              user_id: perfilInstancia.id,
              grupo_jid: jid,
              grupo_nome: nomeGrupo,
              permitido: false,
            });
            return json({ ok: true, ignorado: "grupo_novo_nao_permitido" });
          }

          await supabaseAdmin
            .from("grupos_whatsapp")
            .update({
              ultima_mensagem_em: new Date().toISOString(),
              grupo_nome: existente.grupo_nome ?? nomeGrupo,
            })
            .eq("id", existente.id);

          if (!existente.permitido) {
            return json({ ok: true, ignorado: "grupo_nao_permitido" });
          }

          // Filtro barato por tema ANTES de gastar IA
          const temas = (existente.temas as string[] | null) ?? [];
          const tema = texto ? casaComTemas(texto, temas) : null;
          if (!tema) {
            return json({ ok: true, ignorado: "grupo_sem_tema" });
          }

          try {
            const { triarMensagemInterna } = await import("@/lib/kiah-triagem.server");
            const res = await triarMensagemInterna({
              texto,
              origem: "whatsapp_terceiros",
              user_id: perfilInstancia.id,
              canal: "grupo",
              grupo_nome: existente.grupo_nome ?? nomeGrupo ?? null,
              grupo_jid: jid,
            });
            return json({ ...res, ok: true, canal: "grupo", tema, silenciado: true });
          } catch (e) {
            console.error("[kiah-webhook] triagem de grupo falhou", e);
            return json({ ok: false, silenciado: true }, 200);
          }
        }

        // ─────────────────────── DIRETO ───────────────────────
        const perfilRemetente = await perfilPorNumero(numeroRemetente);
        const ehSelfChat = numeroRemetente === numeroInstancia;

        // Quem é o dono desta conversa e a mensagem partiu dele?
        let dono = perfilInstancia;
        let mensagemDoDono = false;

        if (ehSelfChat) {
          mensagemDoDono = true;
        } else if (perfilRemetente?.id && !fromMe) {
          // O próprio dono escrevendo do número dele para a instância.
          dono = perfilRemetente;
          mensagemDoDono = true;
        }

        if (!dono?.id || !dono.whatsapp_numero) {
          return json({ ok: true, ignorado: "sem_dono_resolvido" });
        }
        const userId = dono.id;
        const destino = normalizarNumeroCadastro(dono.whatsapp_numero);

        async function responderDono(resposta: string) {
          if (!resposta) return;
          try {
            await enviarWhatsApp(resposta, destino);
            await supabaseAdmin.from("kiah_envios_log").insert({
              user_id: userId,
              tipo_envio: "comando_resposta",
              motivo: "resposta a comando do dono",
            });
          } catch (e) {
            console.error("[kiah-webhook] envio falhou", e);
          }
        }

        // Anti-loop: eco das próprias mensagens do Kiah
        if (
          fromMe &&
          /^\s*(?:✅|🛒|📅|⏳|🔥|📘|📝|🗑️|🤔|🫧|⚠️|🤖|📭|✓|🔕|🔔|🌅|🌙|☀️|🗂️|🔎|💬|👥)/.test(texto)
        ) {
          return json({ ok: true, ignorado: "eco_bot" });
        }

        const temImagem = !!(msg as any).imageMessage;
        const temAudio = !!(msg as any).audioMessage;

        // Comandos: só do dono, em texto puro
        if (mensagemDoDono && texto && !temImagem && !temAudio) {
          const { tentarComando } = await import("@/lib/kiah-comandos.server");
          const cmd = await tentarComando(texto, userId);
          if (cmd.tratado) {
            await responderDono(cmd.resposta ?? "✅ Ok.");
            return json({ ok: true, comando: true });
          }
        }

        // Terceiro em conversa direta → buffer (silêncio total)
        if (!mensagemDoDono) {
          if (!texto) return json({ ok: true, ignorado: "midia_em_dialogo_terceiro" });
          await supabaseAdmin.from("mensagens_dialogo").insert({
            user_id: userId,
            jid,
            from_me: fromMe,
            push_name: d?.pushName ?? null,
            texto,
          });
          return json({ ok: true, bufferizado: true });
        }

        // Mensagem do dono que não é comando → triagem
        let imagem_base64: string | undefined;
        let imagem_mime: string | undefined;
        let audio_base64: string | undefined;
        let audio_format: "ogg" | "mp3" | "wav" | "m4a" | "webm" | undefined;

        try {
          if (temImagem || temAudio) {
            const mid = await baixarMidiaBase64({
              key: { remoteJid: jid, id: d?.key?.id ?? "", fromMe: false },
              message: msg,
            });
            if (temImagem) {
              imagem_base64 = mid.base64;
              imagem_mime = mid.mimetype || "image/jpeg";
            } else {
              audio_base64 = mid.base64;
              const mt = (mid.mimetype || "").toLowerCase();
              audio_format = mt.includes("mp3")
                ? "mp3"
                : mt.includes("wav")
                  ? "wav"
                  : mt.includes("m4a") || mt.includes("mp4")
                    ? "m4a"
                    : mt.includes("webm")
                      ? "webm"
                      : "ogg";
            }
          }
        } catch (e) {
          console.error("[kiah-webhook] erro baixando mídia", e);
          return json({ ok: false, error: "download_midia_falhou" }, 200);
        }

        if (!texto && !imagem_base64 && !audio_base64) {
          return json({ ok: true, ignorado: "mensagem sem conteúdo utilizável" });
        }

        try {
          const { triarMensagemInterna } = await import("@/lib/kiah-triagem.server");
          const res = await triarMensagemInterna({
            texto,
            origem: "whatsapp_pessoal",
            imagem_base64,
            imagem_mime,
            audio_base64,
            audio_format,
            user_id: userId,
            canal: "direto",
          });
          // Silêncio: o que foi criado aparece na Caixa de Entrada do app.
          return json({ ...res, ok: true, silenciado: true });
        } catch (e) {
          const msgErr = e instanceof Error ? e.message : String(e);
          console.error("[kiah-webhook] triagem falhou", msgErr);
          return json({ ok: false, error: msgErr, silenciado: true }, 200);
        }
      },
    },
  },
});
