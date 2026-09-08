import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BellOff, Loader2, Check, Tag } from "lucide-react";
import {
  obterMinhasPreferencias,
  salvarMinhasPreferencias,
  type PrefsAlerta,
} from "@/lib/kiah-perfil.functions";
import { salvarTemasGrupo } from "@/lib/kiah-grupos.functions";

const PADRAO: PrefsAlerta = {
  alertas_pausados: false,
  quiet_start: 21,
  quiet_end: 7,
  max_proativos_dia: 6,
  intervalo_min_minutos: 90,
  resumo_manha: "07:30",
  resumo_meiodia: "12:30",
  resumo_noite: "18:30",
  cobrar_fim_de_semana: false,
};

/** Seção "Alertas do WhatsApp" da tela de Perfil. */
export function AlertasConfig() {
  const carregar = useServerFn(obterMinhasPreferencias);
  const salvar = useServerFn(salvarMinhasPreferencias);

  const [p, setP] = useState<PrefsAlerta>(PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    carregar({ data: undefined as never })
      .then((r) => setP(r as PrefsAlerta))
      .catch(() => {})
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof PrefsAlerta>(k: K, v: PrefsAlerta[K]) {
    setP((old) => ({ ...old, [k]: v }));
    setMsg(null);
  }

  async function gravar() {
    setSalvando(true);
    setMsg(null);
    try {
      await salvar({ data: p });
      setMsg("Preferências salvas.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface/40 p-6">
      <div className="mb-1 flex items-center gap-2">
        <BellOff className="size-4 text-ember" />
        <h2 className="font-display text-lg font-bold">Alertas do WhatsApp</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        O Kiah envia poucos avisos, agrupados em resumos. Itens que ainda estão na{" "}
        <strong>Caixa de Entrada</strong> nunca geram mensagem — só depois que você
        confirma.
      </p>

      {carregando ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
            <span className="text-sm font-semibold">Pausar alertas</span>
            <input
              type="checkbox"
              checked={p.alertas_pausados}
              onChange={(e) => set("alertas_pausados", e.target.checked)}
              className="size-5 accent-[hsl(var(--ember))]"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
            <span className="text-sm font-semibold">Cobrar no fim de semana</span>
            <input
              type="checkbox"
              checked={p.cobrar_fim_de_semana}
              onChange={(e) => set("cobrar_fim_de_semana", e.target.checked)}
              className="size-5 accent-[hsl(var(--ember))]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Num
              label="Máximo de mensagens por dia"
              value={p.max_proativos_dia}
              min={1}
              max={20}
              onChange={(v) => set("max_proativos_dia", v)}
            />
            <Num
              label="Intervalo mínimo (minutos)"
              value={p.intervalo_min_minutos}
              min={15}
              max={480}
              onChange={(v) => set("intervalo_min_minutos", v)}
            />
            <Num
              label="Silêncio começa (hora)"
              value={p.quiet_start}
              min={0}
              max={23}
              onChange={(v) => set("quiet_start", v)}
            />
            <Num
              label="Silêncio termina (hora)"
              value={p.quiet_end}
              min={0}
              max={23}
              onChange={(v) => set("quiet_end", v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Hora label="Resumo da manhã" value={p.resumo_manha} onChange={(v) => set("resumo_manha", v)} />
            <Hora label="Checagem do meio-dia" value={p.resumo_meiodia} onChange={(v) => set("resumo_meiodia", v)} />
            <Hora label="Resumo do fim do dia" value={p.resumo_noite} onChange={(v) => set("resumo_noite", v)} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={gravar}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-xs font-bold text-ember-foreground hover:brightness-110 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Salvar preferências
            </button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function Num({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function Hora({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

/** Editor de temas monitorados de um grupo. */
export function TemasGrupo({
  id,
  temas,
  onSalvo,
}: {
  id: string;
  temas: string[];
  onSalvo: () => void;
}) {
  const salvar = useServerFn(salvarTemasGrupo);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(temas.join(", "));
  const [salvando, setSalvando] = useState(false);

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <Tag className="size-3" />
        Temas monitorados ({temas.length})
      </button>
      {aberto && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="aula, prova, prazo, reunião…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await salvar({
                  data: { id, temas: texto.split(",").map((t) => t.trim()).filter(Boolean) },
                });
                setAberto(false);
                onSalvo();
              } finally {
                setSalvando(false);
              }
            }}
            className="rounded-lg bg-ember px-3 py-2 text-[11px] font-bold text-ember-foreground hover:brightness-110 disabled:opacity-60"
          >
            {salvando ? "…" : "Salvar temas"}
          </button>
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Só mensagens que citam um desses temas passam pela triagem.
      </p>
    </div>
  );
}
