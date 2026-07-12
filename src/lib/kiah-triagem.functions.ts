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


type TriagemResultado = {
  classe: "tarefa_urgente" | "tarefa_rotina" | "academico" | "lista_compras" | "ruido";
  descricao_limpa: string;
  prazo_iso: string | null;
  raciocinio_curto: string;
  itens_compra?: Array<{ descricao: string; categoria: string }>;
};

const PROMPT_SISTEMA = `Você é o núcleo de triagem do Kiah, um Segundo Cérebro para um usuário
(Lucas) com TDAH severo e memória de curto prazo vulnerável. Cada mensagem
chega crua — texto, transcrição de áudio, ou descrição de foto. Seu papel é:

1. Compreender a intenção real, mesmo em frases desconexas.
2. Classificar em UMA categoria:
   - "tarefa_urgente": prazo em horas, consequência imediata.
   - "academico": obrigação de trabalho como professor (diário, notas, prova).
   - "tarefa_rotina": afazer sem urgência específica.
   - "lista_compras": item(ns) a comprar. Pode ter múltiplos itens.
   - "ruido": desabafo, saudação, ou nada acionável.
3. Escrever "descricao_limpa": UMA frase curta imperativa, sem enrolação.
   Ex: "Lançar frequência do 9º ano B no diário".
4. Se houver prazo claro, devolver ISO 8601 em "prazo_iso" (fuso America/Sao_Paulo).
   Caso contrário, null.
5. Para "lista_compras", preencher "itens_compra" com cada item separado e
   categoria em: Supermercado, Papelaria, Farmácia, Casa, Outros.

Responda APENAS com JSON válido, sem markdown, sem \`\`\`json:
{
  "classe": "...",
  "descricao_limpa": "...",
  "prazo_iso": null | "2025-...",
  "raciocinio_curto": "...",
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
    });
    if (error) throw new Error(`Falha inserindo tarefa: ${error.message}`);

    return { ok: true, classe: resultado.classe, resultado, criados: 1 };
  });
