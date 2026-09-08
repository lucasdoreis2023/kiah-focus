/**
 * Ciclo de alertas do Kiah (server-only).
 * Chamado pelo cron em /api/public/alertas-persistentes.
 *
 * Em modo `simular`, calcula tudo mas NÃO envia WhatsApp, NÃO grava log e
 * NÃO atualiza contadores — serve para validar a política anti-spam.
 */

import {
  bloqueioDaTarefa,
  carregarPrefs,
  classificar,
  ehUrgenciaReal,
  estatisticasProativas,
  emHorarioSilencioso,
  iconeTipo,
  janelaAtual,
  janelaDaSugestao,
  partesBRT,
  registrarEnvio,
  type Balde,
  type Janela,
  type TarefaAlerta,
} from "./kiah-alertas.server";

type Envio = {
  user_id: string;
  tipo_envio: string;
  texto: string;
  tarefas: string[];
  sugestoes: string[];
};

const CAMPOS_TAREFA =
  "id, id_curto, descricao_limpa, tipo_demanda, subtipo, canal, prazo_estimado, status, confirmado, alertas_enviados, alertas_hoje, alertas_dia_ref, silenciada_ate, sugerida_em, recebida_em, user_id";

function fmtPrazo(iso: string | null): string {
  if (!iso) return "sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function linhaTarefa(t: TarefaAlerta): string {
  const cod = t.id_curto ?? t.id.slice(0, 6);
  const grupo = t.canal === "grupo" ? " · 👥 grupo" : "";
  const prazo = t.prazo_estimado ? ` · ${fmtPrazo(t.prazo_estimado)}` : "";
  return `${iconeTipo(t.tipo_demanda)} [${cod}] ${t.descricao_limpa}${prazo}${grupo}`;
}

function bloco(titulo: string, itens: TarefaAlerta[]): string[] {
  if (!itens.length) return [];
  return [``, `*${titulo}*`, ...itens.map(linhaTarefa)];
}

export async function executarCicloAlertas(opcoes: { simular?: boolean } = {}) {
  const simular = opcoes.simular === true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { enviarWhatsApp } = await import("@/lib/kiah-whatsapp.server");

  const agora = new Date();
  const p = partesBRT(agora);

  // Donos com WhatsApp vinculado
  const { data: perfis, error: erroPerfis } = await supabaseAdmin
    .from("profiles")
    .select("id, whatsapp_numero")
    .not("whatsapp_numero", "is", null);
  if (erroPerfis) return { ok: false, error: erroPerfis.message };

  const relatorio: Array<Record<string, unknown>> = [];
  const envios: Envio[] = [];

  for (const perfil of perfis ?? []) {
    const userId = perfil.id as string;
    const numero = perfil.whatsapp_numero as string;
    const prefs = await carregarPrefs(supabaseAdmin as never, userId);

    if (prefs.alertas_pausados) {
      relatorio.push({ userId, decisao: "pausado" });
      continue;
    }
    if (emHorarioSilencioso(prefs, p)) {
      relatorio.push({ userId, decisao: "horario_silencioso" });
      continue;
    }

    const { hoje: proativosHoje, ultimoEm } = await estatisticasProativas(
      supabaseAdmin as never,
      userId,
      agora,
    );
    if (proativosHoje >= prefs.max_proativos_dia) {
      relatorio.push({ userId, decisao: "limite_diario_atingido", proativosHoje });
      continue;
    }

    // Corte na origem: só tarefas pendentes E confirmadas na Caixa de Entrada.
    const { data: linhas } = await supabaseAdmin
      .from("tarefas")
      .select(CAMPOS_TAREFA)
      .eq("user_id", userId)
      .eq("status", "pendente")
      .eq("confirmado", true)
      .order("prazo_estimado", { ascending: true, nullsFirst: false });

    const tarefas = (linhas ?? []) as unknown as TarefaAlerta[];

    const elegiveis: TarefaAlerta[] = [];
    const bloqueadas: Record<string, number> = {};
    for (const t of tarefas) {
      const motivo = bloqueioDaTarefa(t, agora, prefs, p);
      if (motivo) {
        bloqueadas[motivo] = (bloqueadas[motivo] ?? 0) + 1;
        continue;
      }
      elegiveis.push(t);
    }

    const baldes = new Map<Balde, TarefaAlerta[]>();
    for (const t of elegiveis) {
      const b = classificar(t, agora, p);
      if (!baldes.has(b)) baldes.set(b, []);
      baldes.get(b)!.push(t);
    }
    const pega = (b: Balde) => baldes.get(b) ?? [];

    // Tarefas antigas (>7d) nunca geram alerta individual: só contagem.
    const antigas = pega("antiga").length;

    const janela = janelaAtual(prefs, p);
    const minutosDesdeUltimo = ultimoEm
      ? (agora.getTime() - ultimoEm.getTime()) / 60000
      : Infinity;

    const urgentes = elegiveis.filter((t) => ehUrgenciaReal(t, agora));

    let tipo_envio: string | null = null;
    let linhasMsg: string[] = [];
    let incluidas: TarefaAlerta[] = [];

    const sugestoesDaJanela = (j: Janela) =>
      pega("sugestao_material").filter((t) => janelaDaSugestao(t.recebida_em) === j);

    if (!janela) {
      // Fora das janelas: só urgência real.
      if (urgentes.length && minutosDesdeUltimo >= 30) {
        tipo_envio = "urgente";
        incluidas = urgentes;
        linhasMsg = [
          `🔥 Atenção agora (${urgentes.length}):`,
          ...urgentes.map(linhaTarefa),
          ``,
          `_Responda "feito <código>" ou "adiar <código> 30"._`,
        ];
      } else {
        relatorio.push({
          userId,
          decisao: "fora_de_janela_sem_urgencia",
          elegiveis: elegiveis.length,
          bloqueadas,
        });
        continue;
      }
    } else {
      if (minutosDesdeUltimo < prefs.intervalo_min_minutos && !urgentes.length) {
        relatorio.push({ userId, decisao: "intervalo_minimo", minutosDesdeUltimo });
        continue;
      }

      if (janela === "manha") {
        const venceHoje = [...pega("urgente"), ...pega("vence_hoje")];
        const recentes = pega("vencida_recente");
        const consolidadas = pega("vencida_consolidada");
        const sugestoes = sugestoesDaJanela("manha");
        incluidas = [...venceHoje, ...recentes, ...consolidadas, ...sugestoes];
        if (!incluidas.length && !antigas) {
          relatorio.push({ userId, decisao: "nada_para_resumo_manha", bloqueadas });
          continue;
        }
        tipo_envio = "resumo_manha";
        linhasMsg = [
          `🌅 Bom dia! Resumo do dia:`,
          ...bloco("Hoje", venceHoje),
          ...bloco("Atrasadas (últimas 24h)", recentes),
          ...bloco("Atrasadas da semana", consolidadas),
          ...bloco("Sugestões de material", sugestoes),
        ];
        if (antigas) {
          linhasMsg.push(``, `🗂️ ${antigas} pendência(s) com mais de 7 dias esperam revisão no app.`);
        }
      } else if (janela === "meiodia") {
        const atencao = [...pega("urgente"), ...pega("vence_hoje"), ...pega("vencida_recente")];
        const sugestoes = sugestoesDaJanela("meiodia");
        incluidas = [...atencao, ...sugestoes];
        if (!incluidas.length) {
          relatorio.push({ userId, decisao: "nada_para_checagem_meiodia", bloqueadas });
          continue;
        }
        tipo_envio = "resumo_meiodia";
        linhasMsg = [
          `☀️ Checagem do meio-dia:`,
          ...bloco("Precisa de atenção", atencao),
          ...bloco("Sugestões de material", sugestoes),
        ];
      } else {
        const pendentesHoje = [
          ...pega("urgente"),
          ...pega("vence_hoje"),
          ...pega("vencida_recente"),
        ];
        const amanha = pega("amanha");
        const sugestoes = sugestoesDaJanela("noite");
        incluidas = [...pendentesHoje, ...amanha, ...sugestoes];
        if (!incluidas.length) {
          relatorio.push({ userId, decisao: "nada_para_resumo_noite", bloqueadas });
          continue;
        }
        tipo_envio = "resumo_noite";
        linhasMsg = [
          `🌙 Fechamento do dia:`,
          ...bloco("Ainda em aberto hoje", pendentesHoje),
          ...bloco("Amanhã", amanha),
          ...bloco("Sugestões de material", sugestoes),
        ];
      }
      linhasMsg.push(``, `_"feito <código>" · "adiar <código> 30" · "silenciar <código>" · "pausar alertas"_`);
    }

    const texto = linhasMsg.join("\n");
    const idsIncluidos = incluidas.map((t) => t.id);
    const idsSugestoes = incluidas
      .filter((t) => t.subtipo === "sugestao_material")
      .map((t) => t.id);

    envios.push({
      user_id: userId,
      tipo_envio: tipo_envio!,
      texto,
      tarefas: idsIncluidos,
      sugestoes: idsSugestoes,
    });

    relatorio.push({
      userId,
      decisao: "envio",
      tipo_envio,
      tarefas: idsIncluidos.length,
      bloqueadas,
      antigas,
    });

    if (simular) continue;

    try {
      await enviarWhatsApp(texto, numero);
    } catch (e) {
      relatorio.push({
        userId,
        decisao: "falha_envio",
        erro: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    await registrarEnvio(supabaseAdmin as never, {
      user_id: userId,
      tipo_envio: tipo_envio!,
      motivo: `janela=${janela ?? "urgencia"}`,
      metadados: { tarefas: idsIncluidos },
    });

    // Contadores por tarefa
    for (const t of incluidas) {
      const hojeAtual = t.alertas_dia_ref === p.dia ? t.alertas_hoje : 0;
      await supabaseAdmin
        .from("tarefas")
        .update({
          alertas_enviados: (t.alertas_enviados ?? 0) + 1,
          alertas_hoje: hojeAtual + 1,
          alertas_dia_ref: p.dia,
          ultimo_alerta_em: agora.toISOString(),
          ...(idsSugestoes.includes(t.id) ? { sugerida_em: p.dia } : {}),
        } as never)
        .eq("id", t.id);
    }
  }

  const dialogos = await varrerDialogos(supabaseAdmin, agora, simular);

  return { ok: true, agoraBRT: p, simulado: simular, envios: envios.length, relatorio, dialogos, mensagens: envios.map((e) => e.texto) };
}

/**
 * Diálogos com terceiros: agrupa mensagens ociosas (>5 min sem novidade),
 * roda a triagem no diálogo inteiro e joga tudo na Caixa de Entrada.
 * NÃO envia WhatsApp — silêncio total nesse caminho.
 */
async function varrerDialogos(supabaseAdmin: any, agora: Date, simular: boolean) {
  const processados: Array<{ jid: string; msgs: number; extraiu: number }> = [];
  try {
    const { data: pendentes } = await supabaseAdmin
      .from("mensagens_dialogo")
      .select("id, user_id, jid, from_me, push_name, texto, criado_em")
      .is("processado_em", null)
      .order("criado_em", { ascending: true })
      .limit(500);

    const limite = new Date(agora.getTime() - 5 * 60_000);
    const grupos = new Map<string, any[]>();
    for (const m of pendentes ?? []) {
      const k = `${m.user_id}::${m.jid}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(m);
    }

    for (const [, msgs] of grupos) {
      if (!msgs.length) continue;
      if (new Date(msgs[msgs.length - 1].criado_em) > limite) continue;
      if (simular) continue;

      const userId = msgs[0].user_id;
      const jid = msgs[0].jid;
      const nome = msgs.find((m: any) => m.push_name)?.push_name ?? "contato";
      const transcript = msgs
        .map((m: any) => `${m.from_me ? "Eu" : nome}: ${m.texto}`)
        .join("\n");

      const contexto = `Segue um diálogo de WhatsApp entre o dono ("Eu") e um contato ("${nome}"). Analise a CONVERSA INTEIRA e extraia SOMENTE o que ficou PENDENTE PARA O DONO fazer, lembrar ou comprar como consequência deste diálogo. Ignore saudações, respostas curtas, assuntos resolvidos, promessas do contato e tudo que não gere ação concreta para o dono. Se nada ficou pendente para o dono, retorne ruido=true.\n\n=== DIÁLOGO ===\n${transcript}\n=== FIM ===`;

      let extraiu = 0;
      try {
        const { triarMensagem } = await import("@/lib/kiah-triagem.functions");
        const res = await triarMensagem({
          data: { texto: contexto, origem: "whatsapp_terceiros", user_id: userId },
        });
        extraiu =
          (res.resultado?.tarefas?.length ?? 0) + (res.resultado?.itens_compra?.length ?? 0);
      } catch (e) {
        console.error("[dialogo] triagem falhou", e);
      }

      await supabaseAdmin
        .from("mensagens_dialogo")
        .update({ processado_em: agora.toISOString() })
        .in(
          "id",
          msgs.map((m: any) => m.id),
        );
      processados.push({ jid, msgs: msgs.length, extraiu });
    }
  } catch (e) {
    console.error("[dialogo] varredura falhou", e);
  }
  return processados;
}
