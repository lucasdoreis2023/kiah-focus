/**
 * Helpers server-only de data/hora em America/Sao_Paulo (BRT).
 */

const TZ = "America/Sao_Paulo";

/** "AGORA (America/Sao_Paulo): quarta, 15/10/2025, 14:32" */
export function agoraBRTHumano(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt.format(d);
}

/** ISO de "agora" em UTC (só um alias legível). */
export function agoraISO(): string {
  return new Date().toISOString();
}

/** Formata um ISO para exibição curta em BRT: "qua 15/10 14:30". */
export function formatarPrazoBRT(iso: string | null | undefined): string {
  if (!iso) return "sem prazo";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Janela [início, fim] em ISO UTC para um "dia BRT" (offset em dias a partir de hoje). */
export function janelaDiaBRT(offsetDias = 0): { inicioISO: string; fimISO: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(partes.find((p) => p.type === "year")!.value);
  const m = Number(partes.find((p) => p.type === "month")!.value);
  const d = Number(partes.find((p) => p.type === "day")!.value);
  // Meia-noite BRT = 03:00 UTC (BRT é UTC-3, sem horário de verão desde 2019)
  const inicio = new Date(Date.UTC(y, m - 1, d + offsetDias, 3, 0, 0));
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicioISO: inicio.toISOString(), fimISO: fim.toISOString() };
}

/** Janela dos próximos N dias (a partir de agora). */
export function janelaProximosDias(dias: number): { inicioISO: string; fimISO: string } {
  const agora = new Date();
  const fim = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
  return { inicioISO: agora.toISOString(), fimISO: fim.toISOString() };
}

/**
 * Usa Lovable AI Gateway para converter uma expressão natural em ISO 8601.
 * Retorna null se não conseguir interpretar.
 * Ex: "sexta 9h", "amanhã 14:30", "dia 20 às 10", "daqui 2h".
 */
export async function interpretarDataNatural(texto: string): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const prompt = `Converta a expressão de tempo do usuário em ISO 8601 no fuso America/Sao_Paulo (UTC-3).
AGORA (${TZ}): ${agoraBRTHumano()}.
Se a expressão for ambígua ou sem tempo, retorne {"iso": null}.
Se hora não for dada, assuma 09:00 BRT.
Responda APENAS JSON: {"iso": "2025-10-17T12:00:00-03:00"} ou {"iso": null}.

Expressão: "${texto.replace(/"/g, '\\"')}"`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const c = j.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(c) as { iso?: string | null };
    if (!parsed.iso) return null;
    const d = new Date(parsed.iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
