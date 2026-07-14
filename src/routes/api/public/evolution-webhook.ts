import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da Evolution API.
 * URL a configurar na Evolution:
 *   https://<host>/api/public/evolution-webhook
 *
 * Fluxo:
 *  1. Aceita apenas MESSAGES_UPSERT.
 *  2. Resolve o dono pelo número WhatsApp cadastrado que recebeu a mensagem.
 *     Contato externo nunca recebe confirmação do Kiah.
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
    key?: { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string };
    message?: Record<string, unknown>;
    messageType?: string;
    pushName?: string;
    participant?: string;
    sender?: string;
  };
};

const CATEGORIA_GRUPO_BLOQUEADO = "Grupos bloqueados";

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
  if (typeof (msg as any).conversation === "string") return (msg as any).conversation;
  if (typeof (msg as any).extendedTextMessage?.text === "string") {
    return (msg as any).extendedTextMessage.text;
  }
  if (typeof (msg as any).imageMessage?.caption === "string") return (msg as any).imageMessage.caption;
  if (typeof (msg as any).audioMessage?.caption === "string") return (msg as any).audioMessage.caption;
  if (typeof (msg as any).documentMessage?.caption === "string") return (msg as any).documentMessage.caption;
  if (typeof (msg as any).documentMessage?.fileName === "string") return (msg as any).documentMessage.fileName;
  if (typeof (msg as any).videoMessage?.caption === "string") return (msg as any).videoMessage.caption;
  if (typeof (msg as any).locationMessage?.name === "string") return (msg as any).locationMessage.name;
  if (typeof (msg as any).locationMessage?.address === "string") return (msg as any).locationMessage.address;
  return "";
}

function resumoItemGrupo(texto: string, tipo?: string, grupo?: string): string {
  const base = texto.trim() || tipo || "Mensagem de grupo";
  const curto = base.replace(/\s+/g, " ").slice(0, 220);
  return grupo ? `[${grupo}] ${curto}` : curto;
}

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

  async function montarListaCompras(): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("itens_lista")
      .select("id, descricao, categoria, created_at")
      .eq("user_id", userId)
      .eq("comprado", false)
      .order("categoria", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return `⚠️ Erro ao buscar lista: ${error.message}`;
    if (!data || data.length === 0) return "🛒 Lista de compras vazia.";
    const grupos = new Map<string, typeof data>();
    for (const it of data) {
      const cat = it.categoria || "Outros";
      if (!grupos.has(cat)) grupos.set(cat, [] as any);
      grupos.get(cat)!.push(it);
    }
    const linhas: string[] = [`🛒 Lista de compras (${data.length}):`];
    for (const [cat, itens] of grupos) {
      linhas.push(`\n*${cat}*`);
      for (const it of itens) linhas.push(`• ${it.descricao}`);
    }
    linhas.push(`\n_Marque comprado: "comprei <item>"_`);
    return linhas.join("\n");
  }

  async function montarTarefasPendentes(titulo = "Tarefas pendentes"): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("tarefas")
      .select("id, descricao_limpa, prazo_estimado, tipo_demanda")
      .eq("user_id", userId)
      .eq("status", "pendente")
      .order("prazo_estimado", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) return `⚠️ Erro: ${error.message}`;
    if (!data || data.length === 0) return `📭 ${titulo}: nada pendente.`;
    const linhas = data.map((r) => {
      const ic =
        r.tipo_demanda === "tarefa_urgente" ? "🔥" :
        r.tipo_demanda === "academico" ? "📘" : "📝";
      const prazo = r.prazo_estimado ? ` · 📅 ${formatarPrazoBRT(r.prazo_estimado)}` : "";
      return `${ic} [${idCurto(r.id)}] ${r.descricao_limpa}${prazo}`;
    });
    return `📝 ${titulo} (${data.length}):\n${linhas.join("\n")}`;
  }

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

  // lista / lista de compras / minha lista / compras / mercado
  if (/^(lista(\s+de\s+compras)?|minha\s+lista|compras|mercado)\s*[!?.]?$/i.test(t)) {
    return { tratado: true, resposta: await montarListaCompras() };
  }

  // tarefas / tarefas do dia / pendentes / o que tenho
  if (/^(tarefas(\s+(do\s+dia|de\s+hoje|pendentes))?|pendentes|o\s+que\s+(tenho|falta)|minhas\s+tarefas)\s*[!?.]?$/i.test(t)) {
    return { tratado: true, resposta: await montarTarefasPendentes() };
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
        "• *lista* — mostra a lista de compras completa",
        "• *tarefas* — mostra tarefas pendentes",
        "• hoje / amanhã / semana — agenda por data",
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
        console.log("[kiah-webhook] evento=", evento, "instance=", payload.instance);
        if (!/messages[._-]upsert/i.test(evento)) {
          console.log("[kiah-webhook] IGNORADO evento não-upsert");
          return json({ ok: true, ignorado: `evento ${evento}` });
        }

        const d = payload.data;
        const jid = d?.key?.remoteJid ?? "";
        const fromMe = d?.key?.fromMe === true;
        const messageId = d?.key?.id ?? "";
        console.log("[kiah-webhook] jid=", jid, "fromMe=", fromMe, "messageType=", d?.messageType, "pushName=", d?.pushName, "id=", messageId);

        const { jidParaNumero, numeroKiah, enviarWhatsApp, baixarMidiaBase64 } = await import(
          "@/lib/kiah-whatsapp.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ── Dedupe: ignora retentativas da Evolution para o mesmo message_id.
        if (messageId) {
          const { error: dupErr } = await supabaseAdmin
            .from("webhook_eventos_processados")
            .insert({ message_id: messageId });
          if (dupErr) {
            // Conflito de PK = já processado antes.
            console.log("[kiah-webhook] IGNORADO duplicado message_id=", messageId);
            return json({ ok: true, ignorado: "duplicado" });
          }
        }

        const numeroCadastradoKiahTop = normalizarNumeroCadastro(numeroKiah());


        // ─── Grupos: só processa se explicitamente permitido pelo dono. ───
        if (ehJidGrupo(jid)) {
          const { data: dono } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("whatsapp_numero", numeroCadastradoKiahTop)
            .limit(1)
            .maybeSingle();

          if (!dono?.id) {
            console.log("[kiah-webhook] grupo ignorado: sem dono cadastrado");
            return json({ ok: true, ignorado: "grupo_sem_dono" });
          }

          const nomeGrupo =
            (d?.message as any)?.groupName ??
            (d as any)?.groupMetadata?.subject ??
            d?.pushName ??
            null;

          const { data: existente } = await supabaseAdmin
            .from("grupos_whatsapp")
            .select("id, permitido, grupo_nome")
            .eq("user_id", dono.id)
            .eq("grupo_jid", jid)
            .maybeSingle();

          let permitido = false;
          if (existente) {
            permitido = existente.permitido;
            await supabaseAdmin
              .from("grupos_whatsapp")
              .update({
                ultima_mensagem_em: new Date().toISOString(),
                grupo_nome: existente.grupo_nome ?? nomeGrupo,
              })
              .eq("id", existente.id);
          } else {
            await supabaseAdmin.from("grupos_whatsapp").insert({
              user_id: dono.id,
              grupo_jid: jid,
              grupo_nome: nomeGrupo,
              permitido: false,
            });
          }

          if (!permitido) {
            console.log("[kiah-webhook] grupo detectado e ignorado (não permitido):", jid);
            return json({ ok: true, ignorado: "grupo_nao_permitido" });
          }
          // Se permitido, segue o fluxo normal abaixo (triagem).
        }

        // O número do "outro lado" da conversa. Se fromMe=true (a instância
        // enviou), remoteJid é o destinatário. No cenário "Kiah roda no meu
        // próprio WhatsApp / self-chat", esse destinatário É o próprio dono
        // — então continuamos processando.
        const numeroRemetente = jidParaNumero(jid);
        console.log("[kiah-webhook] numeroRemetente=", numeroRemetente);

        const msg = d?.message ?? {};
        const texto = extrairTextoMensagem(msg);
        // (grupos já foram descartados antes deste ponto)
        const numeroCadastradoKiah = normalizarNumeroCadastro(numeroKiah());
        const remetenteEhNumeroCadastrado = numeroRemetente === numeroCadastradoKiah;

        async function perfilPorNumero(numero: string) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id, whatsapp_numero")
            .eq("whatsapp_numero", numero)
            .limit(1)
            .maybeSingle();
          return data;
        }

        // Resolver dono:
        // - Toda conversa direta recebida por esta instância entra no número cadastrado da instância.
        // - Só o próprio número cadastrado pode comandar/receber como remetente direto.
        // - Mensagens enviadas pela instância para contatos externos são ignoradas.
        // - Grupos nunca recebem resposta; viram item temporário do número cadastrado da instância.
        let userId: string | null = null;
        let numeroResposta = "";

        if (!fromMe || remetenteEhNumeroCadastrado) {
          const donoNumeroCadastrado = await perfilPorNumero(numeroCadastradoKiah);
          if (donoNumeroCadastrado?.id) {
            userId = donoNumeroCadastrado.id;
            numeroResposta = donoNumeroCadastrado.whatsapp_numero ?? numeroCadastradoKiah;
          }
        }

        if (!userId || !numeroResposta) {
          console.log("[kiah-webhook] IGNORADO sem número cadastrado resolvido. remetente=", numeroRemetente, "fromMe=", fromMe);
          return json({
            ok: true,
            ignorado: `número ${numeroRemetente} não roteado para uma conta Kiah cadastrada`,
          });
        }

        // Blindagem: TODA resposta do Kiah só pode ir para o número cadastrado do dono.
        // Se por qualquer motivo o destino não bater, silencia (nunca responde a terceiros).
        const destinoAutorizado = normalizarNumeroCadastro(numeroResposta);
        if (!destinoAutorizado || destinoAutorizado !== numeroCadastradoKiah) {
          console.log(
            "[kiah-webhook] IGNORADO destino de resposta não autorizado. destino=",
            destinoAutorizado,
            "cadastrado=",
            numeroCadastradoKiah,
          );
          return json({ ok: true, ignorado: "destino_nao_autorizado" });
        }
        async function responderDono(texto: string) {
          if (!texto) return;
          try {
            console.log("[kiah-webhook] respondendo dono destino=", destinoAutorizado);
            await enviarWhatsApp(texto, destinoAutorizado);
          } catch (e) {
            console.error("[kiah-webhook] envio falhou", e);
          }
        }




        // Anti-loop: se fromMe=true e o texto começa com marcadores do próprio
        // Kiah (as confirmações que ele envia), ignora pra não triar o próprio eco.
        if (fromMe) {
          if (/^\s*(?:✅|🛒|📅|⏳|🔥|📘|📝|🗑️|🤔|🫧|⚠️|🤖|📭|✓)/.test(texto)) {
            console.log("[kiah-webhook] IGNORADO eco do próprio Kiah");
            return json({ ok: true, ignorado: "eco_bot" });
          }
        }

        console.log("[kiah-webhook] dono userId=", userId);

        const temImagem = !!(msg as any).imageMessage;
        const temAudio = !!(msg as any).audioMessage;

        // Grupos já foram bloqueados no topo do handler; nada a fazer aqui.


        // Se é texto puro, tentar comando primeiro
        if (remetenteEhNumeroCadastrado && texto && !temImagem && !temAudio) {
          const cmd = await tentarComando(texto, userId);
          if (cmd.tratado) {
            await responderDono(cmd.resposta ?? "✅ Ok.");
            return json({ ok: true, comando: true });
          }
        }

        // ─── Diálogos com terceiros: NÃO triar mensagem a mensagem. ───
        // Bufferiza o texto; um cron varre conversas ociosas (>5 min sem
        // nova mensagem) e roda a triagem no diálogo inteiro, procurando
        // apenas o que ficou pendente para o dono.
        if (!remetenteEhNumeroCadastrado && !ehJidGrupo(jid)) {
          if (!texto) {
            return json({ ok: true, ignorado: "midia_em_dialogo_terceiro" });
          }
          await supabaseAdmin.from("mensagens_dialogo").insert({
            user_id: userId,
            jid,
            from_me: fromMe,
            push_name: d?.pushName ?? null,
            texto,
          });
          console.log("[kiah-webhook] mensagem bufferizada de diálogo jid=", jid);
          return json({ ok: true, bufferizado: true });
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
          await responderDono(
            "⚠️ Kiah recebeu sua mídia mas não consegui baixar. Tenta reenviar como texto?",
          );

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

          // Silêncio absoluto no WhatsApp após triagem:
          // - Ruído: nunca avisar.
          // - Tarefas/itens criados: só aparecem no app; WhatsApp só recebe
          //   alertas ativos (D-1, D-0 08:00 BRT, pós-vencimento) via cron.
          // - Lista de compras: consolidada é enviada só na data agendada
          //   (pelo cron/comando "lista"), nunca item a item.
          return json({ ...res, ok: true, silenciado: true });
        } catch (e) {
          const msgErr = e instanceof Error ? e.message : String(e);
          console.error("[kiah-webhook] triagem falhou", msgErr);
          // Silenciar erros de triagem no WhatsApp — evita ruído.
          return json({ ok: false, error: msgErr, silenciado: true }, 200);
        }

      },

    },
  },
});
