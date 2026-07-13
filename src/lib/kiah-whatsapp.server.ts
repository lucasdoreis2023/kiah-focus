/**
 * Helpers server-only para conversar com a Evolution API.
 * Uso: import dentro de handlers de server function / server route.
 */

function baseConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instance) {
    throw new Error("Evolution API não configurada (URL/KEY/INSTANCE).");
  }
  return { url: url.replace(/\/$/, ""), key, instance };
}

export function numeroKiah(): string {
  const n = process.env.KIAH_WHATSAPP_NUMERO;
  if (!n) throw new Error("KIAH_WHATSAPP_NUMERO ausente.");
  return n;
}

/** Envia texto simples via Evolution para o número do Lucas (ou outro). */
export async function enviarWhatsApp(texto: string, para?: string): Promise<void> {
  const { url, key, instance } = baseConfig();
  const number = para ?? numeroKiah();
  const resp = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number, text: texto }),
  });
  if (!resp.ok) {
    const det = await resp.text();
    throw new Error(`Evolution sendText ${resp.status}: ${det.slice(0, 200)}`);
  }
}

/**
 * Baixa mídia (imagem/áudio/documento) de uma mensagem recebida.
 * Retorna { base64, mimetype }.
 */
export async function baixarMidiaBase64(payloadMensagem: {
  key: { remoteJid: string; id: string; fromMe?: boolean };
  message: Record<string, unknown>;
}): Promise<{ base64: string; mimetype: string }> {
  const { url, key, instance } = baseConfig();
  const resp = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ message: payloadMensagem, convertToMp4: false }),
  });
  if (!resp.ok) {
    const det = await resp.text();
    throw new Error(`Evolution getBase64 ${resp.status}: ${det.slice(0, 200)}`);
  }
  const json = (await resp.json()) as { base64?: string; mimetype?: string };
  if (!json.base64) throw new Error("Evolution não devolveu base64.");
  return { base64: json.base64, mimetype: json.mimetype ?? "application/octet-stream" };
}

/** Extrai apenas dígitos do remoteJid ("5527...@s.whatsapp.net" -> "5527..."). */
export function jidParaNumero(jid: string): string {
  return jid.split("@")[0].replace(/\D/g, "");
}

/** Lista todos os grupos da instância Evolution vinculada. */
export async function listarGruposEvolution(): Promise<
  Array<{ id: string; subject?: string | null }>
> {
  const { url, key, instance } = baseConfig();
  const resp = await fetch(
    `${url}/group/fetchAllGroups/${instance}?getParticipants=false`,
    { method: "GET", headers: { apikey: key } },
  );
  if (!resp.ok) {
    const det = await resp.text();
    throw new Error(`Evolution fetchAllGroups ${resp.status}: ${det.slice(0, 200)}`);
  }
  const json = (await resp.json()) as unknown;
  const arr = Array.isArray(json)
    ? json
    : Array.isArray((json as { groups?: unknown[] })?.groups)
      ? ((json as { groups: unknown[] }).groups)
      : [];
  return arr
    .map((g) => {
      const o = g as { id?: string; subject?: string | null };
      return { id: String(o?.id ?? ""), subject: o?.subject ?? null };
    })
    .filter((g) => g.id.endsWith("@g.us"));
}

