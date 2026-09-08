import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Triagem Kiah — recebe uma mensagem crua (texto, foto e/ou áudio em base64)
 * e usa o Lovable AI Gateway (Gemini) para:
 *   1. Transcrever áudio / descrever imagem quando houver.
 *   2. Classificar em: tarefa_urgente | tarefa_rotina | academico | lista_compras | ruido.
 *   3. Extrair descrição limpa, prazo estimado (ISO) e, para compras,
 *      um array de itens com categoria.
 *
 * O resultado é gravado direto em `public.tarefas` ou `public.itens_lista`
 * usando o cliente service_role (fase pré-auth — RLS aberto, single-user).
 */

const InputSchema = z.object({
  texto: z.string().optional().default(""),
  origem: z
    .enum(["manual", "whatsapp_pessoal", "whatsapp_terceiros", "konecta_i"])
    .default("manual"),
  imagem_base64: z.string().optional(),
  imagem_mime: z.string().optional(),
  audio_base64: z.string().optional(),
  audio_format: z.enum(["webm", "mp3", "wav", "m4a", "ogg", "aac", "flac"]).optional(),
  user_id: z.string().uuid().optional(),
  canal: z.enum(["direto", "grupo", "manual"]).default("direto"),
  grupo_nome: z.string().nullable().optional(),
  grupo_jid: z.string().nullable().optional(),
});


type TarefaExtraida = {
  tipo: "tarefa_urgente" | "tarefa_rotina" | "academico";
  descricao_limpa: string;
  prazo_iso: string | null;
  subtipo?: "sugestao_material" | null;
};

type ItemCompra = { descricao: string; categoria: string };

type TriagemResultado = {
  ruido: boolean;
  raciocinio_curto: string;
  tarefas: TarefaExtraida[];
  itens_compra: ItemCompra[];
};

async function construirPromptSistema(canal: "direto" | "grupo" | "manual"): Promise<string> {
  const { agoraBRTHumano } = await import("./kiah-datas.server");
  const regraCanal =
    canal === "grupo"
      ? `ESTA MENSAGEM VEIO DE UM GRUPO. O padrão é RUÍDO. Só crie tarefa se houver
evidência EXPLÍCITA de obrigação do dono: ele foi citado nominalmente, recebeu
uma atribuição direta, ou há um prazo/entrega claramente dele. Aviso geral,
informação, combinado entre terceiros, parabéns, bom dia, foto, link e
conversa solta = ruido: true.`
      : `Mensagem direta. Ainda assim, priorize o silêncio: só vira tarefa o que
exige uma AÇÃO CONCRETA do dono.`;

  return `Você é o núcleo de triagem do Kiah, um Segundo Cérebro para um usuário
(Lucas, professor) com TDAH severo e memória de curto prazo vulnerável.

AGORA (America/Sao_Paulo, UTC-3): ${agoraBRTHumano()}.
Use este "agora" para resolver TODA expressão relativa: "hoje", "amanhã",
"sexta", "próxima segunda", "dia 15", "em 2h", "daqui uma semana". Se ano/mês
não forem ditos, escolha o PRÓXIMO futuro mais próximo. Se só a data for dita,
assuma 09:00 BRT. Se só a hora for dita, use HOJE se ainda não passou, senão
AMANHÃ.

${regraCanal}

PRINCÍPIO CENTRAL: na dúvida, silêncio. É melhor perder uma tarefa do que
encher o usuário de cobranças. Informação, aviso, desabafo, agradecimento,
combinado sem prazo e conversa geral são SEMPRE ruido: true.

Regras:
1. Uma mesma mensagem pode conter várias demandas; extraia todas as que forem
   ação concreta do dono.
2. Para CADA tarefa, um objeto em "tarefas" com:
   - "tipo": "tarefa_urgente" SOMENTE quando há prazo em horas E consequência
     imediata; "academico" para obrigação escolar concreta (entregar diário,
     lançar notas, aplicar prova, preparar aula com data); "tarefa_rotina"
     para o resto. NUNCA marque conteúdo acadêmico como urgente só por ser
     da escola.
   - "descricao_limpa": UMA frase curta imperativa. Ex: "Pagar aluguel".
   - "prazo_iso": ISO 8601 com offset -03:00 quando houver prazo claro, senão null.
   - "subtipo": "sugestao_material" SOMENTE quando existe necessidade CONCRETA
     de preparar/criar/adaptar material pedagógico (há pedido, turma, conteúdo
     ou contexto real que exige o material), porém sem urgência imediata — a
     sugestão será oferecida na janela inteligente do dia. Caso contrário null.
     Sugestão é sugestão, não cobrança: nunca marque como urgente.
     Mera ideia, menção, possibilidade, brainstorm ou conversa geral sobre
     aula/material SEM necessidade concreta => "ruido": true e NENHUMA tarefa.
     NUNCA transforme menção genérica a aula/material em tarefa.
3. Para CADA item a comprar, um objeto em "itens_compra" com "descricao" e
   "categoria" em: Supermercado, Papelaria, Farmácia, Casa, Outros.
4. Nada acionável → "ruido": true e arrays vazios.

Responda APENAS com JSON válido, sem markdown, sem \`\`\`json:
{
  "ruido": false,
  "raciocinio_curto": "...",
  "tarefas": [ { "tipo": "...", "descricao_limpa": "...", "prazo_iso": null, "subtipo": null } ],
  "itens_compra": [ { "descricao": "...", "categoria": "..." } ]
}`;
}

function extrairJson(conteudo: string): TriagemResultado {
  try {
    return JSON.parse(conteudo) as TriagemResultado;
  } catch {
    const match = conteudo.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Modelo não retornou JSON: ${conteudo.slice(0, 200)}`);
    return JSON.parse(match[0]) as TriagemResultado;
  }
}

/** Chamada direta à API pública do Gemini (Google AI Studio) — custo zero no tier free. */
async function chamarGeminiDireto(
  apiKey: string,
  partesUsuario: Array<Record<string, unknown>>,
  modelo: string,
  canal: "direto" | "grupo" | "manual",
): Promise<TriagemResultado> {
  const systemPrompt = await construirPromptSistema(canal);

  // Converter "content parts" OpenAI-style -> "parts" nativos do Gemini
  const parts: Array<Record<string, unknown>> = [];
  for (const p of partesUsuario) {
    if (p.type === "text") {
      parts.push({ text: p.text as string });
    } else if (p.type === "image_url") {
      const url = (p.image_url as { url: string }).url;
      const m = url.match(/^data:(.+?);base64,(.+)$/);
      if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    } else if (p.type === "input_audio") {
      const audio = p.input_audio as { data: string; format: string };
      const mime =
        audio.format === "mp3"
          ? "audio/mp3"
          : audio.format === "wav"
            ? "audio/wav"
            : audio.format === "ogg"
              ? "audio/ogg"
              : audio.format === "aac"
                ? "audio/aac"
                : audio.format === "flac"
                  ? "audio/flac"
                  : audio.format === "m4a"
                    ? "audio/mp4"
                    : "audio/webm";
      parts.push({ inline_data: { mime_type: mime, data: audio.data } });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  if (!resp.ok) {
    const detalhe = await resp.text();
    throw new Error(`Gemini direto ${resp.status}: ${detalhe.slice(0, 300)}`);
  }

  const json = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const conteudo = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!conteudo) throw new Error("Resposta vazia do Gemini direto.");
  return extrairJson(conteudo);
}

/** Fallback: Lovable AI Gateway. */
async function chamarGeminiGateway(
  apiKey: string,
  partesUsuario: Array<Record<string, unknown>>,
  modelo: string,
  canal: "direto" | "grupo" | "manual",
): Promise<TriagemResultado> {
  const systemPrompt = await construirPromptSistema(canal);
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: partesUsuario },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const detalhe = await resp.text();
    throw new Error(`Gateway ${resp.status}: ${detalhe.slice(0, 300)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const conteudo = json.choices?.[0]?.message?.content ?? "";
  if (!conteudo) throw new Error("Resposta vazia do modelo (gateway).");
  return extrairJson(conteudo);
}

export const triarMensagem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!geminiKey && !lovableKey) {
      throw new Error("Nenhuma chave de IA configurada (GEMINI_API_KEY / LOVABLE_API_KEY).");
    }

    // Montar os "content parts" do usuário conforme a modalidade recebida
    const partes: Array<Record<string, unknown>> = [];
    const contextoTexto = data.texto?.trim();

    if (contextoTexto) {
      partes.push({ type: "text", text: contextoTexto });
    }

    if (data.imagem_base64) {
      const url = data.imagem_base64.startsWith("data:")
        ? data.imagem_base64
        : `data:${data.imagem_mime ?? "image/jpeg"};base64,${data.imagem_base64}`;
      partes.push({ type: "image_url", image_url: { url } });
      if (!contextoTexto) {
        partes.unshift({
          type: "text",
          text: "Analise esta imagem e extraia a demanda que ela representa (ex: uma lista escrita à mão, um bilhete, uma prova, um item para comprar).",
        });
      }
    }

    if (data.audio_base64 && data.audio_format) {
      partes.push({
        type: "input_audio",
        input_audio: { data: data.audio_base64, format: data.audio_format },
      });
      if (!contextoTexto) {
        partes.unshift({
          type: "text",
          text: "Transcreva este áudio e triaga o que ele pede.",
        });
      }
    }

    if (partes.length === 0) {
      throw new Error("Nada para triar: envie texto, imagem ou áudio.");
    }

    // Gemini nativo aceita texto, imagem e áudio no mesmo modelo (gemini-2.5-flash).
    // Fallback: gateway Lovable (gpt-5-mini para áudio, gemini-2.5-flash caso contrário).
    let resultado: TriagemResultado;
    let usou: "gemini_direto" | "lovable_gateway" = "gemini_direto";
    try {
      if (!geminiKey) throw new Error("sem GEMINI_API_KEY");
      resultado = await chamarGeminiDireto(geminiKey, partes, "gemini-2.5-flash", data.canal);
    } catch (err) {
      if (!lovableKey) throw err;
      console.warn(
        "[triagem] Gemini direto falhou, caindo para gateway Lovable:",
        err instanceof Error ? err.message : err,
      );
      const modeloFallback = data.audio_base64
        ? "openai/gpt-5-mini"
        : "google/gemini-2.5-flash";
      resultado = await chamarGeminiGateway(lovableKey, partes, modeloFallback, data.canal);
      usou = "lovable_gateway";
    }


    // Persistir — usa cliente admin (permite user_id explícito).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (resultado.ruido) {
      return { ok: true, ruido: true, resultado, criados: 0, provedor: usou };
    }

    let criados = 0;
    let duplicadas = 0;
    const agoraIso = new Date().toISOString();

    if (resultado.itens_compra?.length) {
      const linhas = resultado.itens_compra.map((it) => ({
        descricao: it.descricao,
        categoria: it.categoria || "Outros",
        origem: data.origem,
        user_id: data.user_id ?? null,
        origem_grupo_jid: data.grupo_jid ?? null,
        origem_grupo_nome: data.grupo_nome ?? null,
      }));
      const { error } = await supabaseAdmin.from("itens_lista").insert(linhas);
      if (error) throw new Error(`Falha inserindo itens: ${error.message}`);
      criados += linhas.length;
    }

    if (resultado.tarefas?.length) {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

      // Dedupe semântico simples: mesma descrição normalizada + prazo próximo.
      const { data: existentes } = data.user_id
        ? await supabaseAdmin
            .from("tarefas")
            .select("id, descricao_limpa, prazo_estimado, contexto")
            .eq("user_id", data.user_id)
            .in("status", ["pendente", "adiada"])
        : { data: [] as any[] };

      for (const t of resultado.tarefas) {
        const alvoNorm = norm(t.descricao_limpa);
        const alvoPrazo = t.prazo_iso ? new Date(t.prazo_iso).getTime() : null;

        const dup = (existentes ?? []).find((e: any) => {
          if (norm(e.descricao_limpa ?? "") !== alvoNorm) return false;
          const ep = e.prazo_estimado ? new Date(e.prazo_estimado).getTime() : null;
          if (ep === null && alvoPrazo === null) return true;
          if (ep === null || alvoPrazo === null) return false;
          return Math.abs(ep - alvoPrazo) <= 60 * 60 * 1000;
        });

        if (dup) {
          duplicadas += 1;
          await supabaseAdmin
            .from("tarefas")
            .update({
              contexto: {
                ...(dup.contexto ?? {}),
                ultima_ocorrencia_em: agoraIso,
                ultima_origem: data.origem,
                ...(data.grupo_nome ? { ultimo_grupo: data.grupo_nome } : {}),
              },
            })
            .eq("id", dup.id);
          continue;
        }

        const ehGrupo = data.canal === "grupo";
        const { error } = await supabaseAdmin.from("tarefas").insert({
          descricao_limpa: t.descricao_limpa,
          tipo_demanda: t.tipo,
          prazo_estimado: t.prazo_iso,
          cadencia_alerta_minutos:
            t.tipo === "tarefa_urgente" || t.tipo === "academico" ? 30 : 120,
          origem: data.origem,
          user_id: data.user_id ?? null,
          canal: ehGrupo ? "grupo" : "direto",
          subtipo: t.subtipo === "sugestao_material" ? "sugestao_material" : null,
          recebida_em: agoraIso,
          confirmado: false,
          contexto: ehGrupo
            ? { grupo_nome: data.grupo_nome ?? null, grupo_jid: data.grupo_jid ?? null }
            : null,
        });
        if (error) throw new Error(`Falha inserindo tarefa: ${error.message}`);
        criados += 1;
        (existentes as any[])?.push({
          id: "novo",
          descricao_limpa: t.descricao_limpa,
          prazo_estimado: t.prazo_iso,
          contexto: null,
        });
      }
    }

    return { ok: true, ruido: false, resultado, criados, duplicadas, provedor: usou };

  });
