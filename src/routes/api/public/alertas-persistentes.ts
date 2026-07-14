import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint — chamado pelo pg_cron a cada 5 min.
 *
 * Lembretes enviados para o WhatsApp do dono (profiles.whatsapp_numero):
 *  1. D-1: 24h antes do prazo (uma vez, janela de tolerância de 30 min).
 *  2. D-0 08:00 BRT: às 8h da manhã do dia da tarefa (uma vez).
 *  3. Após vencer: alertas insistentes conforme cadência (limite 8).
 *
 * Flags de controle ficam em tarefas.contexto: { avisado_d1, avisado_d0_manha }.
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

// Hora atual em BRT (America/Sao_Paulo) como { y,m,d,h,min }
function agoraBRT(agora: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const g = (t: string) => Number(fmt.find((p) => p.type === t)?.value);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), min: g("minute") };
}

// YYYY-MM-DD (BRT) de uma data
function diaBRT(d: Date) {
  const p = agoraBRT(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export const Route = createFileRoute("/api/public/alertas-persistentes")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enviarWhatsApp } = await import("@/lib/kiah-whatsapp.server");

        const agora = new Date();
        const brt = agoraBRT(agora);
        const hojeBRT = `${brt.y}-${String(brt.m).padStart(2, "0")}-${String(brt.d).padStart(2, "0")}`;

        // Buscar TODAS as tarefas pendentes com prazo (não só as vencidas)
        const { data: tarefas, error } = await supabaseAdmin
          .from("tarefas")
          .select("*")
          .eq("status", "pendente")
          .not("user_id", "is", null)
          .not("prazo_estimado", "is", null);
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

        const MAX_POR_EXECUCAO = 20;
        const MAX_ALERTAS_POR_TAREFA = 8;

        for (const t of tarefas ?? []) {
          if (enviados >= MAX_POR_EXECUCAO) break;

          const numero = numeroPorUsuario.get(t.user_id!);
          if (!numero) {
            detalhes.push({ id: t.id, motivo: "sem_whatsapp_vinculado" });
            continue;
          }

          const prazo = new Date(t.prazo_estimado!);
          const diffMin = (prazo.getTime() - agora.getTime()) / 60000;
          const ctx = (t.contexto as Record<string, unknown> | null) ?? {};
          const avisadoD1 = ctx.avisado_d1 === true;
          const avisadoD0Manha = ctx.avisado_d0_manha === true;

          const prazoDia = diaBRT(prazo);
          const prazoTxt = prazo.toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          });
          const prefixo =
            t.tipo_demanda === "tarefa_urgente"
              ? "🔥 URGENTE"
              : t.tipo_demanda === "academico"
                ? "📘 ACADÊMICO"
                : "📝 LEMBRETE";

          type Envio = { texto: string; patch: Record<string, unknown>; motivo: string } | null;
          let envio: Envio = null;

          // 1) D-1: entre 23h30 e 24h30 antes do prazo
          if (!avisadoD1 && diffMin > 0 && diffMin >= 23 * 60 + 30 && diffMin <= 24 * 60 + 30) {
            envio = {
              texto: `⏳ ${prefixo} amanhã: ${t.descricao_limpa}\n📅 ${prazoTxt}`,
              patch: {
                contexto: { ...ctx, avisado_d1: true },
                ultimo_alerta_em: agora.toISOString(),
              },
              motivo: "d1_enviado",
            };
          }
          // 2) D-0 08:00 BRT: hoje é o dia do prazo, já passou das 8h, ainda não avisou
          else if (
            !avisadoD0Manha &&
            prazoDia === hojeBRT &&
            brt.h >= 8 &&
            diffMin > 0 // ainda não venceu
          ) {
            envio = {
              texto: `🌅 Bom dia! ${prefixo} hoje: ${t.descricao_limpa}\n⏰ ${prazoTxt}`,
              patch: {
                contexto: { ...ctx, avisado_d0_manha: true },
                ultimo_alerta_em: agora.toISOString(),
              },
              motivo: "d0_manha_enviado",
            };
          }
          // 3) Vencida: cadência insistente
          else if (diffMin <= 0) {
            if ((t.adiamentos ?? 0) >= MAX_ALERTAS_POR_TAREFA) {
              detalhes.push({ id: t.id, motivo: "max_alertas_atingido" });
              continue;
            }
            const cadenciaMin = Math.max(t.cadencia_alerta_minutos ?? 60, 30);
            const ultimo = t.ultimo_alerta_em ? new Date(t.ultimo_alerta_em) : null;
            const minutosDesde = ultimo
              ? (agora.getTime() - ultimo.getTime()) / 60000
              : Infinity;
            if (minutosDesde < cadenciaMin) {
              continue;
            }
            const adiSuf = t.adiamentos > 2 ? `  ⚠️ (adiada ${t.adiamentos}x)` : "";
            envio = {
              texto: `${prefixo}: ${t.descricao_limpa}\n⏰ Prazo: ${prazoTxt}${adiSuf}\n\nResponda "feito ${t.id.slice(0, 6)}" ao concluir · "adiar ${t.id.slice(0, 6)} 30" · "desisto ${t.id.slice(0, 6)}"`,
              patch: { ultimo_alerta_em: agora.toISOString() },
              motivo: "vencida_enviado",
            };
          }

          if (!envio) continue;

          try {
            await enviarWhatsApp(envio.texto, numero);
            await supabaseAdmin
              .from("tarefas")
              .update(envio.patch as never)
              .eq("id", t.id);
            enviados++;
            detalhes.push({ id: t.id, motivo: envio.motivo });
          } catch (e) {
            detalhes.push({
              id: t.id,
              motivo: `falha: ${e instanceof Error ? e.message : String(e)}`,
            });
          }
        }

        // ─── Varredura de diálogos ociosos ───
        // Junta mensagens não processadas por (user_id, jid) cuja última
        // atividade foi há > 5 min e envia o transcript para triagem
        // buscando apenas o que ficou pendente para o dono.
        const dialogosProcessados: Array<{ jid: string; msgs: number; extraiu: number }> = [];
        try {
          const { data: pendentes } = await supabaseAdmin
            .from("mensagens_dialogo")
            .select("id, user_id, jid, from_me, push_name, texto, criado_em")
            .is("processado_em", null)
            .order("criado_em", { ascending: true })
            .limit(500);

          const OCIOSO_MIN = 5;
          const limite = new Date(agora.getTime() - OCIOSO_MIN * 60_000);

          const grupos = new Map<string, typeof pendentes>();
          for (const m of pendentes ?? []) {
            const k = `${m.user_id}::${m.jid}`;
            if (!grupos.has(k)) grupos.set(k, [] as never);
            grupos.get(k)!.push(m);
          }

          for (const [, msgs] of grupos) {
            if (!msgs || msgs.length === 0) continue;
            const ultima = new Date(msgs[msgs.length - 1].criado_em);
            if (ultima > limite) continue; // ainda ativo, aguarda

            const userId = msgs[0].user_id;
            const jid = msgs[0].jid;
            const nome = msgs.find((m) => m.push_name)?.push_name ?? "contato";
            const transcript = msgs
              .map((m) => `${m.from_me ? "Eu" : nome}: ${m.texto}`)
              .join("\n");

            const contexto = `Segue um diálogo de WhatsApp entre o dono ("Eu") e um contato ("${nome}"). Analise a CONVERSA INTEIRA e extraia SOMENTE o que ficou PENDENTE PARA O DONO fazer, lembrar ou comprar como consequência deste diálogo. Ignore saudações, respostas curtas, assuntos resolvidos, promessas do contato, e tudo que não gere ação para o dono. Se nada ficou pendente para o dono, retorne ruido=true.\n\n=== DIÁLOGO ===\n${transcript}\n=== FIM ===`;

            let extraiu = 0;
            try {
              const { triarMensagem } = await import("@/lib/kiah-triagem.functions");
              const res = await triarMensagem({
                data: {
                  texto: contexto,
                  origem: "whatsapp_terceiros",
                  user_id: userId,
                },
              });
              extraiu =
                (res.resultado?.tarefas?.length ?? 0) +
                (res.resultado?.itens_compra?.length ?? 0);

              if (extraiu > 0) {
                const numero = numeroPorUsuario.get(userId);
                if (numero) {
                  const partes: string[] = [
                    `💬 Pendências detectadas na conversa com ${nome}:`,
                  ];
                  for (const t of res.resultado.tarefas ?? []) {
                    partes.push(`📝 ${t.descricao_limpa}`);
                  }
                  if ((res.resultado.itens_compra ?? []).length) {
                    partes.push(
                      `🛒 ${(res.resultado.itens_compra ?? []).map((i) => i.descricao).join(", ")}`,
                    );
                  }
                  try {
                    await enviarWhatsApp(partes.join("\n"), numero);
                  } catch (e) {
                    console.error("[dialogo] envio falhou", e);
                  }
                }
              }
            } catch (e) {
              console.error("[dialogo] triagem falhou", e);
            }

            const ids = msgs.map((m) => m.id);
            await supabaseAdmin
              .from("mensagens_dialogo")
              .update({ processado_em: agora.toISOString() })
              .in("id", ids);
            dialogosProcessados.push({ jid, msgs: msgs.length, extraiu });
          }
        } catch (e) {
          console.error("[dialogo] varredura falhou", e);
        }

        return json({
          ok: true,
          verificadas: tarefas?.length ?? 0,
          enviados,
          detalhes,
          dialogos: dialogosProcessados,
        });
      },
    },
  },
});

