/**
 * Motor de alertas inteligentes do Kiah (server-only).
 *
 * Princípio: baixa interrupção. O WhatsApp recebe no máximo algumas
 * mensagens CONSOLIDADAS por dia, em janelas configuráveis, e nunca
 * repete uma tarefa indefinidamente.
 */

const TZ = "America/Sao_Paulo";

export type Prefs = {
  user_id: string;
  alertas_pausados: boolean;
  quiet_start: number;
  quiet_end: number;
  max_proativos_dia: number;
  intervalo_min_minutos: number;
  resumo_manha: string;
  resumo_meiodia: string;
  resumo_noite: string;
  cobrar_fim_de_semana: boolean;
  temas_padrao_grupos: string[];
};

export const PREFS_PADRAO: Omit<Prefs, "user_id"> = {
  alertas_pausados: false,
  quiet_start: 21,
  quiet_end: 7,
  max_proativos_dia: 6,
  intervalo_min_minutos: 90,
  resumo_manha: "07:30",
  resumo_meiodia: "12:30",
  resumo_noite: "18:30",
  cobrar_fim_de_semana: false,
  temas_padrao_grupos: [
    "aula",
    "material",
    "planejamento",
    "prova",
    "avaliação",
    "reunião",
    "prazo",
    "documento",
    "aluno",
    "SEDU",
    "AMA",
  ],
};

export type PartesBRT = {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  dow: number; // 0=domingo
  dia: string; // YYYY-MM-DD
  minutosDoDia: number;
};

export function partesBRT(data: Date): PartesBRT {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(data);
  const g = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
  const y = Number(g("year"));
  const m = Number(g("month"));
  const d = Number(g("day"));
  const h = Number(g("hour")) % 24;
  const min = Number(g("minute"));
  const mapaDow: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y,
    m,
    d,
    h,
    min,
    dow: mapaDow[g("weekday")] ?? 1,
    dia: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    minutosDoDia: h * 60 + min,
  };
}

export function ehFimDeSemana(p: PartesBRT): boolean {
  return p.dow === 0 || p.dow === 6;
}

/** Horário silencioso (pode atravessar a meia-noite). */
export function emHorarioSilencioso(prefs: Prefs, p: PartesBRT): boolean {
  const ini = prefs.quiet_start;
  const fim = prefs.quiet_end;
  if (ini === fim) return false;
  return ini > fim ? p.h >= ini || p.h < fim : p.h >= ini && p.h < fim;
}

function hhmmParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
}

export type Janela = "manha" | "meiodia" | "noite";

/**
 * Qual janela de resumo está aberta agora. Tolerância de 20 min para
 * caber na cadência do cron (a cada 15 minutos).
 */
export function janelaAtual(prefs: Prefs, p: PartesBRT, toleranciaMin = 20): Janela | null {
  const alvos: Array<[Janela, number]> = [
    ["manha", hhmmParaMinutos(prefs.resumo_manha)],
    ["meiodia", hhmmParaMinutos(prefs.resumo_meiodia)],
    ["noite", hhmmParaMinutos(prefs.resumo_noite)],
  ];
  for (const [nome, alvo] of alvos) {
    const delta = p.minutosDoDia - alvo;
    if (delta >= 0 && delta < toleranciaMin) return nome;
  }
  return null;
}

/** Janela útil para uma sugestão de material, conforme a hora em que chegou. */
export function janelaDaSugestao(recebidaEm: string): Janela {
  const p = partesBRT(new Date(recebidaEm));
  const min = p.minutosDoDia;
  if (min >= 5 * 60 && min <= 11 * 60 + 29) return "meiodia";
  if (min >= 11 * 60 + 30 && min <= 16 * 60 + 59) return "noite";
  return "manha";
}

// ─────────────────────────── acesso a dados ───────────────────────────

type Cliente = {
  from: (t: string) => any;
};

export async function carregarPrefs(db: Cliente, userId: string): Promise<Prefs> {
  const { data } = await db
    .from("preferencias_alerta")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as Prefs;
  const novo = { user_id: userId, ...PREFS_PADRAO };
  await db.from("preferencias_alerta").insert(novo);
  return novo as Prefs;
}

export async function registrarEnvio(
  db: Cliente,
  entrada: {
    user_id: string;
    tarefa_id?: string | null;
    tipo_envio: string;
    motivo?: string | null;
    metadados?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db.from("kiah_envios_log").insert({
    user_id: entrada.user_id,
    tarefa_id: entrada.tarefa_id ?? null,
    tipo_envio: entrada.tipo_envio,
    motivo: entrada.motivo ?? null,
    metadados: entrada.metadados ?? null,
  });
}

/** Tipos que contam para o teto diário de mensagens proativas. */
export const TIPOS_PROATIVOS = ["resumo_manha", "resumo_meiodia", "resumo_noite", "urgente"];

export async function estatisticasProativas(
  db: Cliente,
  userId: string,
  agora: Date,
): Promise<{ hoje: number; ultimoEm: Date | null }> {
  const p = partesBRT(agora);
  // Meia-noite BRT = 03:00 UTC
  const inicioDia = new Date(Date.UTC(p.y, p.m - 1, p.d, 3, 0, 0)).toISOString();
  const { data } = await db
    .from("kiah_envios_log")
    .select("enviado_em, tipo_envio")
    .eq("user_id", userId)
    .in("tipo_envio", TIPOS_PROATIVOS)
    .gte("enviado_em", inicioDia)
    .order("enviado_em", { ascending: false });
  const linhas = (data ?? []) as Array<{ enviado_em: string }>;
  return {
    hoje: linhas.length,
    ultimoEm: linhas.length ? new Date(linhas[0].enviado_em) : null,
  };
}

// ─────────────────────────── regras por tarefa ───────────────────────────

export type TarefaAlerta = {
  id: string;
  id_curto: string | null;
  descricao_limpa: string;
  tipo_demanda: string;
  subtipo: string | null;
  canal: string;
  prazo_estimado: string | null;
  status: string;
  confirmado: boolean;
  alertas_enviados: number;
  alertas_hoje: number;
  alertas_dia_ref: string | null;
  silenciada_ate: string | null;
  sugerida_em: string | null;
  recebida_em: string;
};

export const MAX_ALERTAS_TAREFA = 3;
export const MAX_ALERTAS_TAREFA_DIA = 2;
export const MAX_ALERTAS_TAREFA_GRUPO = 1;

export function alertasHojeDe(t: TarefaAlerta, diaBRT: string): number {
  return t.alertas_dia_ref === diaBRT ? t.alertas_hoje : 0;
}

/** Minutos até o prazo (negativo = vencida). null se não houver prazo. */
export function minutosAtePrazo(t: TarefaAlerta, agora: Date): number | null {
  if (!t.prazo_estimado) return null;
  return (new Date(t.prazo_estimado).getTime() - agora.getTime()) / 60000;
}

export function ehUrgenciaReal(t: TarefaAlerta, agora: Date): boolean {
  const m = minutosAtePrazo(t, agora);
  if (m === null) return false;
  if (m > 0 && m <= 120) return true;
  return t.tipo_demanda === "tarefa_urgente" && m <= 0 && m > -24 * 60;
}

export type MotivoBloqueio =
  | "nao_confirmada"
  | "silenciada"
  | "grupo_sem_repeticao"
  | "limite_total"
  | "limite_diario"
  | "fim_de_semana"
  | "sugestao_ja_enviada_hoje"
  | null;

/** A tarefa pode entrar em uma mensagem proativa agora? */
export function bloqueioDaTarefa(
  t: TarefaAlerta,
  agora: Date,
  prefs: Prefs,
  p: PartesBRT,
): MotivoBloqueio {
  if (!t.confirmado) return "nao_confirmada";
  if (t.silenciada_ate && new Date(t.silenciada_ate) > agora) return "silenciada";
  if (t.canal === "grupo" && t.alertas_enviados >= MAX_ALERTAS_TAREFA_GRUPO) {
    return "grupo_sem_repeticao";
  }
  if (t.alertas_enviados >= MAX_ALERTAS_TAREFA) return "limite_total";
  if (alertasHojeDe(t, p.dia) >= MAX_ALERTAS_TAREFA_DIA) return "limite_diario";
  if (t.subtipo === "sugestao_material" && t.sugerida_em === p.dia) {
    return "sugestao_ja_enviada_hoje";
  }
  if (
    ehFimDeSemana(p) &&
    !prefs.cobrar_fim_de_semana &&
    t.tipo_demanda === "tarefa_rotina" &&
    !ehUrgenciaReal(t, agora)
  ) {
    return "fim_de_semana";
  }
  return null;
}

export type Balde =
  | "urgente"
  | "vence_hoje"
  | "vencida_recente" // < 24h
  | "vencida_consolidada" // 24h .. 7 dias
  | "antiga" // > 7 dias — só contagem
  | "amanha"
  | "sugestao_material"
  | "sem_prazo";

export function classificar(t: TarefaAlerta, agora: Date, p: PartesBRT): Balde {
  if (t.subtipo === "sugestao_material") return "sugestao_material";
  const m = minutosAtePrazo(t, agora);
  if (m === null) return "sem_prazo";
  if (m <= 0) {
    const horas = -m / 60;
    if (horas <= 24) return "vencida_recente";
    if (horas <= 24 * 7) return "vencida_consolidada";
    return "antiga";
  }
  if (m <= 120) return "urgente";
  const prazoDia = partesBRT(new Date(t.prazo_estimado!)).dia;
  if (prazoDia === p.dia) return "vence_hoje";
  const amanha = new Date(agora.getTime() + 24 * 3600 * 1000);
  if (prazoDia === partesBRT(amanha).dia) return "amanha";
  return "sem_prazo";
}

export function iconeTipo(tipo: string): string {
  if (tipo === "tarefa_urgente") return "🔥";
  if (tipo === "academico") return "📘";
  return "📝";
}

export function rotuloTema(t: TarefaAlerta): string {
  if (t.subtipo === "sugestao_material") return "Sugestões de material";
  if (t.tipo_demanda === "academico") return "Acadêmico";
  if (t.tipo_demanda === "tarefa_urgente") return "Urgente";
  return "Rotina";
}
