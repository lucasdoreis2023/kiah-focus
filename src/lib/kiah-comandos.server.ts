/**
 * Comandos de WhatsApp do Kiah (server-only).
 *
 * Resolução de código curto sem LIKE em coluna uuid: carrega os ids
 * pendentes do usuário e compara o prefixo em string, no servidor.
 */

type DB = any;

export type ResultadoComando = { tratado: boolean; resposta?: string };

const CODIGO = "[a-f0-9]{4,12}";

function idCurtoDe(t: { id: string; id_curto?: string | null }): string {
  return t.id_curto ?? t.id.slice(0, 6);
}

type TarefaRef = { id: string; id_curto: string | null; descricao_limpa: string; adiamentos: number };

async function pendentesDoUsuario(db: DB, userId: string): Promise<TarefaRef[]> {
  const { data } = await db
    .from("tarefas")
    .select("id, id_curto, descricao_limpa, adiamentos")
    .eq("user_id", userId)
    .in("status", ["pendente", "adiada"]);
  return (data ?? []) as TarefaRef[];
}

/** Resolve um prefixo em UMA tarefa. Nunca usa LIKE sobre uuid. */
export async function resolverPorPrefixo(
  db: DB,
  userId: string,
  prefixo: string,
): Promise<{ tarefa?: TarefaRef; erro?: string }> {
  const alvo = prefixo.toLowerCase();
  const todas = await pendentesDoUsuario(db, userId);
  const achados = todas.filter((t) => t.id.toLowerCase().startsWith(alvo));
  if (achados.length === 0) return { erro: `🤔 Nenhuma tarefa pendente com o código "${prefixo}".` };
  if (achados.length > 1) {
    return {
      erro:
        `🔎 Mais de uma tarefa começa com "${prefixo}". Manda mais caracteres:\n` +
        achados.slice(0, 5).map((t) => `• [${idCurtoDe(t)}] ${t.descricao_limpa}`).join("\n"),
    };
  }
  return { tarefa: achados[0] };
}

const TIPOS_PROATIVOS_LOG = ["resumo_manha", "resumo_meiodia", "resumo_noite", "urgente"];

/**
 * Tarefas do ÚLTIMO envio proativo das últimas 24h (kiah_envios_log.metadados.tarefas),
 * filtradas pelas que continuam pendentes/adiadas.
 */
export async function tarefasDoUltimoAviso(db: DB, userId: string): Promise<TarefaRef[]> {
  const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("kiah_envios_log")
    .select("tarefa_id, metadados, enviado_em, tipo_envio")
    .eq("user_id", userId)
    .in("tipo_envio", TIPOS_PROATIVOS_LOG)
    .gte("enviado_em", limite)
    .order("enviado_em", { ascending: false })
    .limit(1);
  const log = (data ?? [])[0];
  if (!log) return [];

  const brutos: unknown = (log.metadados ?? {})["tarefas"];
  const ids = Array.isArray(brutos)
    ? (brutos as unknown[]).filter((x): x is string => typeof x === "string")
    : log.tarefa_id
      ? [log.tarefa_id as string]
      : [];
  if (ids.length === 0) return [];

  const { data: tarefas } = await db
    .from("tarefas")
    .select("id, id_curto, descricao_limpa, adiamentos")
    .eq("user_id", userId)
    .in("status", ["pendente", "adiada"])
    .in("id", ids);
  return (tarefas ?? []) as TarefaRef[];
}

async function alvoDoComando(
  db: DB,
  userId: string,
  prefixo: string | undefined,
): Promise<{ tarefa?: TarefaRef; erro?: string }> {
  if (prefixo) return resolverPorPrefixo(db, userId, prefixo);

  const candidatas = await tarefasDoUltimoAviso(db, userId);
  if (candidatas.length === 1) return { tarefa: candidatas[0] };
  if (candidatas.length > 1) {
    return {
      erro:
        `🔎 O último aviso tinha ${candidatas.length} tarefas. Diga *feito <código>*:\n` +
        candidatas.slice(0, 5).map((t) => `• [${idCurtoDe(t)}] ${t.descricao_limpa}`).join("\n"),
    };
  }
  return {
    erro:
      '🤔 Não sei a qual tarefa você se refere. Manda o código, ex: "feito abc123" (ou peça *tarefas* para ver a lista).',
  };
}

export async function tentarComando(texto: string, userId: string): Promise<ResultadoComando> {
  const bruto = texto.trim();
  const t = bruto.toLowerCase();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as DB;
  const { formatarPrazoBRT, janelaDiaBRT, janelaProximosDias, interpretarDataNatural } =
    await import("./kiah-datas.server");
  const { carregarPrefs } = await import("./kiah-alertas.server");

  // ───────────── pausar / voltar alertas ─────────────
  if (/^(pausar|silenciar)\s+(alertas|tudo|kiah)\s*[!?.]?$/i.test(t) || /^pausar\s*[!?.]?$/i.test(t)) {
    await carregarPrefs(db, userId);
    await db.from("preferencias_alerta").update({ alertas_pausados: true }).eq("user_id", userId);
    return {
      tratado: true,
      resposta: '🔕 Alertas pausados. Comandos continuam funcionando. Diga "voltar alertas" quando quiser retomar.',
    };
  }
  if (/^(voltar|retomar|ativar)\s+(alertas|tudo|kiah)\s*[!?.]?$/i.test(t) || /^voltar\s*[!?.]?$/i.test(t)) {
    await carregarPrefs(db, userId);
    await db.from("preferencias_alerta").update({ alertas_pausados: false }).eq("user_id", userId);
    return { tratado: true, resposta: "🔔 Alertas religados." };
  }

  // ───────────── listagens ─────────────
  async function montarListaCompras(): Promise<string> {
    const { data, error } = await db
      .from("itens_lista")
      .select("id, descricao, categoria, created_at")
      .eq("user_id", userId)
      .eq("comprado", false)
      .order("categoria", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return `⚠️ Erro ao buscar lista: ${error.message}`;
    if (!data || data.length === 0) return "🛒 Lista de compras vazia.";
    const grupos = new Map<string, any[]>();
    for (const it of data) {
      const cat = it.categoria || "Outros";
      if (!grupos.has(cat)) grupos.set(cat, []);
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
    const { data, error } = await db
      .from("tarefas")
      .select("id, id_curto, descricao_limpa, prazo_estimado, tipo_demanda, confirmado")
      .eq("user_id", userId)
      .eq("status", "pendente")
      .order("prazo_estimado", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) return `⚠️ Erro: ${error.message}`;
    if (!data || data.length === 0) return `📭 ${titulo}: nada pendente.`;
    const conf = data.filter((r: any) => r.confirmado);
    const naoConf = data.filter((r: any) => !r.confirmado);
    const linha = (r: any) => {
      const ic =
        r.tipo_demanda === "tarefa_urgente" ? "🔥" : r.tipo_demanda === "academico" ? "📘" : "📝";
      const prazo = r.prazo_estimado ? ` · 📅 ${formatarPrazoBRT(r.prazo_estimado)}` : "";
      return `${ic} [${idCurtoDe(r)}] ${r.descricao_limpa}${prazo}`;
    };
    const partes = [`📝 ${titulo} (${conf.length}):`, ...conf.map(linha)];
    if (naoConf.length) {
      partes.push(`\n📥 Na Caixa de Entrada, aguardando confirmação: ${naoConf.length}`);
    }
    return partes.join("\n");
  }

  async function listarAgenda(inicioISO: string, fimISO: string, titulo: string) {
    const { data, error } = await db
      .from("tarefas")
      .select("id, id_curto, descricao_limpa, prazo_estimado, tipo_demanda")
      .eq("user_id", userId)
      .eq("status", "pendente")
      .gte("prazo_estimado", inicioISO)
      .lt("prazo_estimado", fimISO)
      .order("prazo_estimado", { ascending: true });
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    if (!data || data.length === 0)
      return { tratado: true, resposta: `📭 ${titulo}: nada agendado.` };
    const linhas = data.map((r: any) => {
      const ic =
        r.tipo_demanda === "tarefa_urgente" ? "🔥" : r.tipo_demanda === "academico" ? "📘" : "📝";
      return `${ic} [${idCurtoDe(r)}] ${formatarPrazoBRT(r.prazo_estimado)} — ${r.descricao_limpa}`;
    });
    return { tratado: true, resposta: `📅 ${titulo} (${data.length}):\n${linhas.join("\n")}` };
  }

  if (/^(lista(\s+de\s+compras)?|minha\s+lista|compras|mercado)\s*[!?.]?$/i.test(t)) {
    return { tratado: true, resposta: await montarListaCompras() };
  }
  if (
    /^(tarefas(\s+(do\s+dia|de\s+hoje|pendentes))?|pendentes|o\s+que\s+(tenho|falta)|minhas\s+tarefas)\s*[!?.]?$/i.test(
      t,
    )
  ) {
    return { tratado: true, resposta: await montarTarefasPendentes() };
  }
  if (/^(hoje|agenda\s+hoje)\s*[!?.]?$/i.test(t)) {
    const j = janelaDiaBRT(0);
    return listarAgenda(j.inicioISO, j.fimISO, "Hoje");
  }
  if (/^(amanh[aã]|agenda\s+amanh[aã])\s*[!?.]?$/i.test(t)) {
    const j = janelaDiaBRT(1);
    return listarAgenda(j.inicioISO, j.fimISO, "Amanhã");
  }
  if (/^(semana|agenda|pr[oó]xima\s+semana|pr[oó]ximos?\s+7\s+dias)\s*[!?.]?$/i.test(t)) {
    const j = janelaProximosDias(7);
    return listarAgenda(j.inicioISO, j.fimISO, "Próximos 7 dias");
  }

  // ───────────── concluir ─────────────
  let m = t.match(new RegExp(`^(?:feito|pronto|conclu[ií]do|conclui|ok)(?:\\s+(${CODIGO}))?\\s*[!.]?$`, "i"));
  if (m) {
    const { tarefa, erro } = await alvoDoComando(db, userId, m[1]);
    if (erro) return { tratado: true, resposta: erro };
    const { error } = await db
      .from("tarefas")
      .update({ status: "concluida", concluida_em: new Date().toISOString() })
      .eq("id", tarefa!.id);
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    return { tratado: true, resposta: `✅ Concluído: ${tarefa!.descricao_limpa}` };
  }

  // ───────────── adiar N minutos ─────────────
  m = t.match(new RegExp(`^adiar\\s+(${CODIGO})\\s+(\\d{1,4})\\s*$`, "i"));
  if (m) {
    const { tarefa, erro } = await alvoDoComando(db, userId, m[1]);
    if (erro) return { tratado: true, resposta: erro };
    const minutos = parseInt(m[2], 10);
    const novoPrazo = new Date(Date.now() + minutos * 60_000).toISOString();
    await db
      .from("tarefas")
      .update({
        prazo_estimado: novoPrazo,
        adiamentos: (tarefa!.adiamentos ?? 0) + 1,
        ultimo_alerta_em: new Date().toISOString(),
      })
      .eq("id", tarefa!.id);
    return {
      tratado: true,
      resposta: `⏳ Adiada +${minutos}min: ${tarefa!.descricao_limpa}\n📅 Novo prazo: ${formatarPrazoBRT(novoPrazo)}`,
    };
  }

  // ───────────── remarcar por data natural ─────────────
  m = bruto.match(new RegExp(`^(?:remarcar|adiar|mover|reagendar)\\s+(${CODIGO})\\s+(.+)$`, "i"));
  if (m && !/^\d+$/.test(m[2].trim())) {
    const { tarefa, erro } = await alvoDoComando(db, userId, m[1]);
    if (erro) return { tratado: true, resposta: erro };
    const iso = await interpretarDataNatural(m[2].trim());
    if (!iso) {
      return {
        tratado: true,
        resposta: `🤔 Não entendi a data "${m[2].trim()}". Tenta "sexta 9h", "amanhã 14h", "dia 20 10h".`,
      };
    }
    await db
      .from("tarefas")
      .update({
        prazo_estimado: iso,
        adiamentos: (tarefa!.adiamentos ?? 0) + 1,
        ultimo_alerta_em: new Date().toISOString(),
      })
      .eq("id", tarefa!.id);
    return {
      tratado: true,
      resposta: `📅 Remarcada: ${tarefa!.descricao_limpa}\n→ ${formatarPrazoBRT(iso)}`,
    };
  }

  // ───────────── descartar / deletar ─────────────
  m = t.match(
    new RegExp(`^(?:desisto|desistir|deletar|apagar|remover|cancelar|descartar)(?:\\s+(${CODIGO}))?\\s*[!.]?$`, "i"),
  );
  if (m) {
    const { tarefa, erro } = await alvoDoComando(db, userId, m[1]);
    if (erro) return { tratado: true, resposta: erro };
    const { error } = await db
      .from("tarefas")
      .update({ status: "descartada" })
      .eq("id", tarefa!.id);
    if (error) return { tratado: true, resposta: `⚠️ Erro: ${error.message}` };
    return { tratado: true, resposta: `🗑️ Removida: ${tarefa!.descricao_limpa}` };
  }

  // ───────────── silenciar tarefa ─────────────
  m = t.match(new RegExp(`^silenciar\\s+(${CODIGO})(?:\\s+(\\d{1,3}))?\\s*$`, "i"));
  if (m) {
    const { tarefa, erro } = await resolverPorPrefixo(db, userId, m[1]);
    if (erro) return { tratado: true, resposta: erro };
    const dias = m[2] ? parseInt(m[2], 10) : 7;
    const ate = new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString();
    await db.from("tarefas").update({ silenciada_ate: ate }).eq("id", tarefa!.id);
    return {
      tratado: true,
      resposta: `🔕 Silenciada por ${dias} dia(s): ${tarefa!.descricao_limpa}`,
    };
  }

  // ───────────── comprei X ─────────────
  m = bruto.match(/^(?:comprei|ja comprei|já comprei)\s+(.+)$/i);
  if (m) {
    const busca = m[1].trim();
    const { data, error } = await db
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
      resposta: `🛒 Comprado: ${data.map((d: any) => d.descricao).join(", ")}`,
    };
  }

  // ───────────── ajuda ─────────────
  if (/^(ajuda|help|comandos|\?)\s*$/i.test(t)) {
    return {
      tratado: true,
      resposta: [
        "🤖 Comandos do Kiah:",
        "• *lista* — lista de compras completa",
        "• *tarefas* — pendentes confirmadas",
        "• hoje / amanhã / semana — agenda",
        "• feito abc123 (ou só *feito*) — conclui",
        "• adiar abc123 30 — adia N minutos",
        "• remarcar abc123 sexta 9h — nova data",
        "• desisto / deletar / apagar / remover / cancelar abc123",
        "• silenciar abc123 7 — sem alertas por N dias",
        "• pausar alertas / voltar alertas",
        "• comprei café — marca da lista",
      ].join("\n"),
    };
  }

  return { tratado: false };
}
