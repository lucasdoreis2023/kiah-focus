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
});


type TarefaExtraida = {
  tipo: "tarefa_urgente" | "tarefa_rotina" | "academico";
  descricao_limpa: string;
  prazo_iso: string | null;
};

type ItemCompra = { descricao: string; categoria: string };

type TriagemResultado = {
  ruido: boolean;
  raciocinio_curto: string;
  tarefas: TarefaExtraida[];
  itens_compra: ItemCompra[];
};

const PROMPT_SISTEMA = `Você é o núcleo de triagem do Kiah, um Segundo Cérebro para um usuário
(Lucas) com TDAH severo e memória de curto prazo vulnerável. Cada mensagem
chega crua — texto, transcrição de áudio, ou descrição de foto.

Uma MESMA mensagem pode conter VÁRIAS demandas de tipos diferentes
(ex: "comprar café e sabão, e lembrar de pagar aluguel dia 15" =
2 itens de compra + 1 tarefa). Extraia TODAS.

Regras:
1. Compreenda a intenção real, mesmo em frases desconexas.
2. Para CADA tarefa (não-compra) encontrada, adicione um objeto em "tarefas" com:
   - "tipo": "tarefa_urgente" (prazo em horas, consequência imediata),
     "academico" (obrigação de professor: diário, notas, prova),
     ou "tarefa_rotina" (afazer sem urgência aguda).
   - "descricao_limpa": UMA frase curta imperativa. Ex: "Pagar aluguel".
   - "prazo_iso": ISO 8601 no fuso America/Sao_Paulo se houver prazo claro
     (data explícita, "amanhã", "sexta", "dia 15"). Caso contrário null.
     Para "dia 15" sem mês, assuma o próximo dia 15 futuro.
3. Para CADA item a comprar, adicione em "itens_compra" com "descricao" e
   "categoria" em: Supermercado, Papelaria, Farmácia, Casa, Outros.
4. Se a mensagem for pura saudação/desabafo/nada acionável, marque
   "ruido": true e deixe os arrays vazios.

Responda APENAS com JSON válido, sem markdown, sem \`\`\`json:
{
  "ruido": false,
  "raciocinio_curto": "...",
  "tarefas": [ { "tipo": "...", "descricao_limpa": "...", "prazo_iso": null } ],
  "itens_compra": [ { "descricao": "...", "categoria": "..." } ]
}`;

function agora() {
  return new Date().toISOString();
}

async function chamarGemini(
  apiKey: string,
  partesUsuario: Array<Record<string, unknown>>,
  modelo: string,
): Promise<TriagemResultado> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: PROMPT_SISTEMA },
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
  if (!conteudo) throw new Error("Resposta vazia do modelo.");

  try {
    return JSON.parse(conteudo) as TriagemResultado;
  } catch {
    // Fallback: tentar extrair bloco JSON
    const match = conteudo.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Modelo não retornou JSON: ${conteudo.slice(0, 200)}`);
    return JSON.parse(match[0]) as TriagemResultado;
  }
}

export const triarMensagem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente no servidor.");

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

    // Áudio precisa de modelo com input de áudio (gpt-5-mini suporta); demais Gemini Flash
    const modelo = data.audio_base64
      ? "openai/gpt-5-mini"
      : "google/gemini-2.5-flash";

    const resultado = await chamarGemini(apiKey, partes, modelo);

    // Persistir — usa cliente admin (fase single-user pré-auth).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (resultado.classe === "ruido") {
      return { ok: true, classe: resultado.classe, resultado, criados: 0 };
    }

    if (resultado.classe === "lista_compras" && resultado.itens_compra?.length) {
      const linhas = resultado.itens_compra.map((it) => ({
        descricao: it.descricao,
        categoria: it.categoria || "Outros",
        origem: data.origem,
        user_id: data.user_id ?? null,
      }));
      const { error } = await supabaseAdmin.from("itens_lista").insert(linhas);
      if (error) throw new Error(`Falha inserindo itens: ${error.message}`);
      return { ok: true, classe: resultado.classe, resultado, criados: linhas.length };
    }

    // Tarefa (urgente / rotina / academico)
    const cadencia =
      resultado.classe === "tarefa_urgente" || resultado.classe === "academico" ? 30 : 120;

    const { error } = await supabaseAdmin.from("tarefas").insert({
      descricao_limpa: resultado.descricao_limpa,
      tipo_demanda: resultado.classe,
      prazo_estimado: resultado.prazo_iso,
      cadencia_alerta_minutos: cadencia,
      origem: data.origem,
      user_id: data.user_id ?? null,
    });
    if (error) throw new Error(`Falha inserindo tarefa: ${error.message}`);


    return { ok: true, classe: resultado.classe, resultado, criados: 1 };
  });
