import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da Evolution API.
 * URL a configurar na Evolution:
 *   https://<host>/api/public/evolution-webhook
 *
 * Fluxo:
 *  1. Aceita apenas MESSAGES_UPSERT.
 *  2. Resolve o dono da mensagem via profiles.whatsapp_numero → user_id.
 *     Se ninguém do sistema tiver esse número vinculado, ignora silenciosamente.
 *  3. Se o texto é um COMANDO ("feito abc123", "adiar abc123 30",
 *     "desisto abc123", "comprei café"), executa direto no banco.
 *  4. Senão, dispara triagem por IA e grava sob o user_id resolvido.
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

/** Reconhece e executa comandos curtos vindos do WhatsApp. */
async function tentarComando(
  texto: string,
  userId: string,
): Promise<{ tratado: boolean; resposta?: string }> {
  const bruto = texto.trim();
  const t = bruto.toLowerCase();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { formatarPrazoBRT, janelaDiaBRT, janelaProximosDias, interpretarDataNatural } =
    await import("@/lib/kiah-datas.server");

  const idCurto = (id: string) => id.slice(0, 6);

  async function listarAgenda(inicioISO: string, fimISO: string, titulo: string) {
    const { data, error } = await supabaseAdmin
      .from("tarefas")
      .select("id, descricao_limpa, prazo_estimado, tipo_demanda")
      .eq("user_id", userId)
      .eq("status", "pendente")
      .gte("prazo_estimado", inicioISO)
      .lt("prazo_estimado", fimISO)
      .order("prazo_estimado", { ascending: true });
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    if (!data || data.length === 0)
      return { tratado: true, resposta: `📭 ${titulo}: nada agendado.` };
    const linhas = data.map((r) => {
      const ic =
        r.tipo_demanda === "tarefa_urgente" ? "🔥" :
        r.tipo_demanda === "academico" ? "📘" : "📝";
      return `${ic} [${idCurto(r.id)}] ${formatarPrazoBRT(r.prazo_estimado)} — ${r.descricao_limpa}`;
    });
    return { tratado: true, resposta: `📅 ${titulo} (${data.length}):\n${linhas.join("\n")}` };
  }

  // hoje / agenda hoje
  if (/^(hoje|agenda\s+hoje)\s*[!?.]?$/i.test(t)) {
    const j = janelaDiaBRT(0);
    return listarAgenda(j.inicioISO, j.fimISO, "Hoje");
  }
  // amanhã / amanha
  if (/^(amanh[aã]|agenda\s+amanh[aã])\s*[!?.]?$/i.test(t)) {
    const j = janelaDiaBRT(1);
    return listarAgenda(j.inicioISO, j.fimISO, "Amanhã");
  }
  // semana / agenda / próximos 7 dias
  if (/^(semana|agenda|pr[oó]xima\s+semana|pr[oó]ximos?\s+7\s+dias)\s*[!?.]?$/i.test(t)) {
    const j = janelaProximosDias(7);
    return listarAgenda(j.inicioISO, j.fimISO, "Próximos 7 dias");
  }

  // feito XXXXXX
  let m = t.match(/^feito\s+([a-f0-9]{4,12})\s*$/i);
  if (m) {
    const prefixo = m[1];
    const { data, error } = await supabaseAdmin
      .from("tarefas")
      .update({ status: "concluida", concluida_em: new Date().toISOString() })
      .like("id", `${prefixo}%`)
      .eq("user_id", userId)
      .eq("status", "pendente")
      .select("descricao_limpa");
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    if (!data || data.length === 0)
      return { tratado: true, resposta: `🤔 Nenhuma tarefa pendente com id "${prefixo}".` };
    return {
      tratado: true,
      resposta: `✅ Concluído: ${data.map((d) => d.descricao_limpa).join(" · ")}`,
    };
  }

  // adiar XXXXXX N  (minutos)
  m = t.match(/^adiar\s+([a-f0-9]{4,12})\s+(\d{1,4})\s*$/i);
  if (m) {
    const prefixo = m[1];
    const minutos = parseInt(m[2], 10);
    const { data: existente } = await supabaseAdmin
      .from("tarefas")
      .select("id, adiamentos, descricao_limpa")
      .like("id", `${prefixo}%`)
      .eq("user_id", userId)
      .eq("status", "pendente")
      .limit(1)
      .maybeSingle();
    if (!existente)
      return { tratado: true, resposta: `🤔 Nenhuma tarefa pendente com id "${prefixo}".` };
    const novoPrazo = new Date(Date.now() + minutos * 60_000).toISOString();
    await supabaseAdmin
      .from("tarefas")
      .update({
        prazo_estimado: novoPrazo,
        adiamentos: (existente.adiamentos ?? 0) + 1,
        ultimo_alerta_em: new Date().toISOString(),
      })
      .eq("id", existente.id);
    return {
      tratado: true,
      resposta: `⏳ Adiada +${minutos}min: ${existente.descricao_limpa}\n📅 Novo prazo: ${formatarPrazoBRT(novoPrazo)}`,
    };
  }

  // remarcar XXXXXX <texto natural>  |  adiar XXXXXX <texto natural>
  m = bruto.match(/^(?:remarcar|adiar|mover|reagendar)\s+([a-f0-9]{4,12})\s+(.+)$/i);
  if (m && !/^\d+$/.test(m[2].trim())) {
    const prefixo = m[1];
    const expressao = m[2].trim();
    const { data: existente } = await supabaseAdmin
      .from("tarefas")
      .select("id, adiamentos, descricao_limpa")
      .like("id", `${prefixo}%`)
      .eq("user_id", userId)
      .eq("status", "pendente")
      .limit(1)
      .maybeSingle();
    if (!existente)
      return { tratado: true, resposta: `🤔 Nenhuma tarefa pendente com id "${prefixo}".` };
    const iso = await interpretarDataNatural(expressao);
    if (!iso)
      return {
        tratado: true,
        resposta: `🤔 Não entendi a data "${expressao}". Tenta "sexta 9h", "amanhã 14h", "dia 20 10h".`,
      };
    await supabaseAdmin
      .from("tarefas")
      .update({
        prazo_estimado: iso,
        adiamentos: (existente.adiamentos ?? 0) + 1,
        ultimo_alerta_em: new Date().toISOString(),
      })
      .eq("id", existente.id);
    return {
      tratado: true,
      resposta: `📅 Remarcada: ${existente.descricao_limpa}\n→ ${formatarPrazoBRT(iso)}`,
    };
  }

  // desisto XXXXXX
  m = t.match(/^desisto\s+([a-f0-9]{4,12})\s*$/i);
  if (m) {
    const prefixo = m[1];
    const { data, error } = await supabaseAdmin
      .from("tarefas")
      .update({ status: "descartada" })
      .like("id", `${prefixo}%`)
      .eq("user_id", userId)
      .eq("status", "pendente")
      .select("descricao_limpa");
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    if (!data || data.length === 0)
      return { tratado: true, resposta: `🤔 Nada pendente com id "${prefixo}".` };
    return {
      tratado: true,
      resposta: `🗑️ Descartada: ${data.map((d) => d.descricao_limpa).join(" · ")}`,
    };
  }

  // comprei X (marca item por busca fuzzy)
  m = bruto.match(/^(?:comprei|ja comprei|já comprei)\s+(.+)$/i);
  if (m) {
    const busca = m[1].trim();
    const { data, error } = await supabaseAdmin
      .from("itens_lista")
      .update({ comprado: true, comprado_em: new Date().toISOString() })
      .ilike("descricao", `%${busca}%`)
      .eq("user_id", userId)
      .eq("comprado", false)
      .select("descricao");
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    if (!data || data.length === 0)
      return { tratado: true, resposta: `🛒 Não achei "${busca}" na lista.` };
    return {
      tratado: true,
      resposta: `🛒 Comprado: ${data.map((d) => d.descricao).join(", ")}`,
    };
  }

  // ajuda
  if (/^(ajuda|help|comandos|\?)\s*$/i.test(t)) {
    return {
      tratado: true,
      resposta: [
        "🤖 Comandos do Kiah:",
        "• hoje / amanhã / semana — sua agenda",
        "• feito ABC123 — conclui tarefa",
        "• adiar ABC123 30 — adia N minutos",
        "• remarcar ABC123 sexta 9h — nova data",
        "• desisto ABC123 — descarta",
        "• comprei café — marca da lista",
        "• (qualquer outra coisa) — triagem por IA",
      ].join("\n"),
    };
  }

  return { tratado: false };
}

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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const numeroRemetente = jidParaNumero(jid);

        // Resolver dono pelo perfil (whatsapp_numero vinculado no 1º login)
        const { data: dono } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("whatsapp_numero", numeroRemetente)
          .limit(1)
          .maybeSingle();

        if (!dono?.id) {
          return json({
            ok: true,
            ignorado: `remetente ${numeroRemetente} não vinculado a nenhum usuário`,
          });
        }
        const userId = dono.id;

        const msg = d?.message ?? {};
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

        const temImagem = !!(msg as any).imageMessage;
        const temAudio = !!(msg as any).audioMessage;

        // Se é texto puro, tentar comando primeiro
        if (texto && !temImagem && !temAudio) {
          const cmd = await tentarComando(texto, userId);
          if (cmd.tratado) {
            await enviarWhatsApp(cmd.resposta ?? "✅ Ok.", numeroRemetente).catch(() => {});
            return json({ ok: true, comando: true });
          }
        }

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
            } else if (temAudio) {
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
          await enviarWhatsApp(
            "⚠️ Kiah recebeu sua mídia mas não consegui baixar. Tenta reenviar como texto?",
            numeroRemetente,
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
              user_id: userId,
            },
          });

          const partes: string[] = [];
          if (res.ruido) {
            partes.push("🫧 Recebi, mas nada acionável — arquivado como ruído.");
          } else {
            const itens = res.resultado.itens_compra ?? [];
            const tarefas = res.resultado.tarefas ?? [];
            if (itens.length) {
              partes.push(`🛒 ${itens.length} item(ns) na lista: ${itens.map((i) => i.descricao).join(", ")}`);
            }
            for (const t of tarefas) {
              const icone =
                t.tipo === "tarefa_urgente" ? "🔥 URGENTE" :
                t.tipo === "academico" ? "📘 Acadêmica" : "📝 Tarefa";
              partes.push(`${icone}: ${t.descricao_limpa}`);
            }
            if (!partes.length) partes.push("✓ Recebido.");
          }
          const resumo = partes.join("\n");

          await enviarWhatsApp(resumo, numeroRemetente).catch((e) =>
            console.error("[kiah-webhook] envio confirmação falhou", e),
          );

          return json({ ...res, ok: true });
        } catch (e) {
          const msgErr = e instanceof Error ? e.message : String(e);
          console.error("[kiah-webhook] triagem falhou", msgErr);
          await enviarWhatsApp(
            `⚠️ Kiah recebeu mas travou na triagem: ${msgErr.slice(0, 140)}`,
            numeroRemetente,
          ).catch(() => {});
          return json({ ok: false, error: msgErr }, 200);
        }
      },
    },
  },
});
