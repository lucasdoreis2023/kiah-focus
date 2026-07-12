import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Mic,
  Plus,
  Sparkles,
  ShoppingBasket,
  Trash2,
  Zap,
  X,
  AlertTriangle,
  CalendarDays,
  History,
  User,
  CircleDot,
} from "lucide-react";

import { triarMensagem } from "@/lib/kiah-triagem.functions";
import { reivindicarDadosOrfaos } from "@/lib/kiah-auth.functions";
import { obterMeuPerfil } from "@/lib/kiah-perfil.functions";

import { supabase } from "@/integrations/supabase/client";
import {
  tarefasPendentesQuery,
  itensListaQuery,
  concluirTarefa,
  adiarTarefa,
  descartarTarefa,
  criarTarefa,
  criarItemLista,
  marcarItemComprado,
  removerItemLista,
} from "@/lib/kiah-queries";
import {
  CATEGORIAS_LISTA,
  TIPOS_TAREFA,
  type Tarefa,
  type TipoDemanda,
} from "@/lib/kiah-types";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Kiah — Segundo Cérebro" },
      {
        name: "description",
        content:
          "Painel Kiah: uma tarefa por vez, alertas persistentes e lista de compras silenciosa.",
      },
      { property: "og:title", content: "Kiah — Segundo Cérebro" },
      {
        property: "og:description",
        content: "Painel de foco absoluto: AGORA, A SEGUIR e Lista de Compras.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(tarefasPendentesQuery),
      context.queryClient.ensureQueryData(itensListaQuery),
    ]),
  component: PainelKiah,
});

/* ============================================================
   LAYOUT: sidebar fixa + área principal (AGORA + grid inferior)
   ============================================================ */

function PainelKiah() {
  const qc = useQueryClient();
  const { data: tarefas } = useSuspenseQuery(tarefasPendentesQuery);
  const { data: itens } = useSuspenseQuery(itensListaQuery);
  const reivindicar = useServerFn(reivindicarDadosOrfaos);
  const carregarPerfil = useServerFn(obterMeuPerfil);
  const [nome, setNome] = useState<string>("");
  const [precisaVincularWa, setPrecisaVincularWa] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const n =
        (u?.user_metadata?.full_name as string | undefined) ??
        (u?.user_metadata?.name as string | undefined) ??
        u?.email?.split("@")[0] ??
        "";
      setNome(n);
    });
    carregarPerfil({ data: undefined as never })
      .then((p) => setPrecisaVincularWa(!p?.whatsapp_numero))
      .catch(() => {});
  }, [carregarPerfil]);

  // Primeira carga após login: adotar tarefas/itens sem dono e vincular WhatsApp.
  useEffect(() => {
    const flag = "kiah_reivindicado_v1";
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(flag)) return;
    reivindicar({ data: {} })
      .then((r) => {
        sessionStorage.setItem(flag, "1");
        if (r && (r.tarefas_migradas > 0 || r.itens_migrados > 0)) {
          qc.invalidateQueries({ queryKey: ["tarefas"] });
          qc.invalidateQueries({ queryKey: ["itens_lista"] });
        }
      })
      .catch((e) => console.error("[kiah] reivindicar falhou", e));
  }, [reivindicar, qc]);

  // Realtime — mantém o painel sincronizado com WhatsApp/Konecta-i.
  useEffect(() => {
    const canal = supabase
      .channel("kiah-painel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tarefas" },
        () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "itens_lista" },
        () => qc.invalidateQueries({ queryKey: ["itens_lista"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc]);

  // "Foco absoluto" = tarefas vencidas OU com prazo até o fim de hoje.
  // Sem prazo, só entra como foco se for urgente. Isso evita que uma conta
  // marcada pro dia 15 apareça como AGORA no dia 12.
  const agora = escolherFoco(tarefas);
  const restante = tarefas.filter((t) => t.id !== agora?.id);
  const aSeguir = restante.slice(0, 2);
  const restanteEscondido = Math.max(restante.length - 2, 0);

  const itensPorCategoria = itens.reduce<Record<string, typeof itens>>((acc, item) => {
    (acc[item.categoria] ??= []).push(item);
    return acc;
  }, {});

  const saudacao = saudacaoHora();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground selection:bg-ember/30">
      <SidebarKiah />

      <main className="flex min-h-screen flex-1 flex-col">
        {/* HEADER */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-4 sm:flex sm:flex-wrap sm:justify-between sm:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="text-muted-foreground">{saudacao},</span>
            <span className="truncate font-semibold text-foreground">
              {nome || "aqui é Kiah"}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <TriagemBotao />
            <span className="hidden h-4 w-px bg-border sm:block" />
            <NovaTarefaBotao />
            <NovoItemBotao />
            <BotaoSair />
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-5 sm:p-8">
          <SecaoAgora tarefa={agora} />

          <div className="mb-4 grid gap-8 lg:grid-cols-2">
            <SecaoASeguir tarefas={aSeguir} escondido={restanteEscondido} />
            <SecaoLista itensPorCategoria={itensPorCategoria} total={itens.length} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */

function SidebarKiah() {
  const itens = [
    { to: "/", label: "Hoje", icon: <CircleDot className="size-4" />, exact: true },
    { to: "/agenda", label: "Agenda", icon: <CalendarDays className="size-4" />, exact: false },
    { to: "/lista", label: "Lista", icon: <ShoppingBasket className="size-4" />, exact: false },
    { to: "/historico", label: "Histórico", icon: <History className="size-4" />, exact: false },
  ] as const;
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="p-6 pb-4">
        <Link to="/" className="block">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ember">
            KIAH
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Segundo cérebro
          </p>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {itens.map((it) => (
          <Link
            key={it.label}
            to={it.to}
            activeOptions={{ exact: it.exact }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface hover:text-foreground data-[status=active]:border data-[status=active]:border-border/60 data-[status=active]:bg-surface data-[status=active]:text-ember"
          >
            {it.icon}
            <span className="font-medium">{it.label}</span>
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <Link
          to="/perfil"
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface hover:text-foreground data-[status=active]:text-ember"
        >
          <div className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface">
            <User className="size-4" />
          </div>
          <span className="truncate">Perfil</span>
        </Link>
      </div>
    </aside>
  );
}

/* Seleciona a tarefa que merece foco AGORA:
   - vencida (prazo < agora) OU com prazo até o fim de hoje → escolhe a mais urgente
   - se não houver nada nessa janela e existir tarefa urgente sem prazo → assume
   - caso contrário, nada. A lista completa continua em "A seguir" / Agenda. */
function escolherFoco(tarefas: Tarefa[]): Tarefa | undefined {
  const agora = new Date();
  const fimHoje = new Date(agora);
  fimHoje.setHours(23, 59, 59, 999);

  const noRadar = tarefas
    .filter((t) => t.prazo_estimado && new Date(t.prazo_estimado) <= fimHoje)
    .sort(
      (a, b) =>
        new Date(a.prazo_estimado!).getTime() -
        new Date(b.prazo_estimado!).getTime(),
    );
  if (noRadar[0]) return noRadar[0];

  return tarefas.find(
    (t) => !t.prazo_estimado && t.tipo_demanda === "tarefa_urgente",
  );
}

/* ---------------- AGORA — herói imersivo ---------------- */

function SecaoAgora({ tarefa }: { tarefa: Tarefa | undefined }) {
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: ["tarefas"] });

  if (!tarefa) {
    return (
      <section className="flex flex-col">
        <RotuloSecao label="Agora" />
        <div className="mt-3 grid min-h-[320px] place-items-center rounded-3xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <div>
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface">
              <Zap className="size-5 text-muted-foreground" />
            </div>
            <p className="font-display text-2xl font-semibold">
              Nada urgente agora.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Respira. Kiah avisa quando algo entrar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const adiadoDemais = tarefa.adiamentos >= 3;

  return (
    <section className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <RotuloSecao label="Agora" />
        {tarefa.adiamentos > 0 && (
          <div
            className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              adiadoDemais
                ? "border-destructive/50 bg-destructive/15 text-destructive"
                : "border-border bg-surface text-muted-foreground"
            }`}
          >
            Adiada {tarefa.adiamentos}×
          </div>
        )}
      </div>

      <div className="group relative flex min-h-[380px] flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-ember bg-surface p-8 shadow-focus sm:p-12">
        {/* brasa glow */}
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-64 rounded-full bg-ember opacity-10 blur-[120px] transition-opacity duration-1000 group-hover:opacity-20" />
        <div className="pointer-events-none absolute -top-24 -left-24 size-48 rounded-full bg-ember opacity-[0.06] blur-[100px]" />

        <div className="relative z-10 max-w-2xl text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <span className="inline-block size-2 animate-pulse rounded-full bg-ember" />
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-ember">
              Foco absoluto
            </p>
            {tarefa.prazo_estimado && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {formatarPrazo(tarefa.prazo_estimado)}
                </span>
              </>
            )}
          </div>

          <h2 className="font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl md:text-6xl">
            {tarefa.descricao_limpa}
          </h2>

          <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">
            {rotuloTipo(tarefa.tipo_demanda)}
          </p>

          {adiadoDemais && (
            <div className="mx-auto mt-6 flex max-w-md items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Você já adiou isso {tarefa.adiamentos} vezes. É uma tarefa curta —
                vamos resolver agora.
              </p>
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={async () => {
                await concluirTarefa(tarefa.id);
                invalidar();
              }}
              className="rounded-2xl bg-ember px-8 py-4 text-base font-bold text-ember-foreground shadow-ember transition-all hover:brightness-110 active:scale-95 sm:px-10 sm:py-5 sm:text-lg"
            >
              <span className="inline-flex items-center gap-2">
                <Check className="size-5" /> Concluí
              </span>
            </button>
            <div className="flex gap-2">
              <BotaoSecundario
                onClick={async () => {
                  await adiarTarefa(tarefa.id, 15, tarefa.adiamentos);
                  invalidar();
                }}
              >
                <Clock className="size-4" /> +15 min
              </BotaoSecundario>
              <BotaoSecundario
                onClick={async () => {
                  await adiarTarefa(tarefa.id, 60, tarefa.adiamentos);
                  invalidar();
                }}
              >
                <Clock className="size-4" /> +1 h
              </BotaoSecundario>
            </div>
            <button
              onClick={async () => {
                await descartarTarefa(tarefa.id);
                invalidar();
              }}
              className="rounded-2xl px-5 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive sm:py-5"
            >
              Desistir
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- A SEGUIR ---------------- */

function SecaoASeguir({
  tarefas,
  escondido,
}: {
  tarefas: Tarefa[];
  escondido: number;
}) {
  const qc = useQueryClient();

  return (
    <section>
      <RotuloSecao label="A seguir" />
      {tarefas.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-surface/30 px-5 py-6 text-sm text-muted-foreground">
          Nada na fila.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {tarefas.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/50 p-5 transition-colors hover:border-ember/40 hover:bg-surface"
            >
              <div className="min-w-0">
                <p className="font-display font-semibold text-foreground">
                  {t.descricao_limpa}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rotuloTipo(t.tipo_demanda)}
                  {t.prazo_estimado ? ` · ${formatarPrazo(t.prazo_estimado)}` : ""}
                </p>
              </div>
              <button
                onClick={async () => {
                  await concluirTarefa(t.id);
                  qc.invalidateQueries({ queryKey: ["tarefas"] });
                }}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-ember hover:bg-ember hover:text-ember-foreground"
                aria-label="Concluir"
              >
                <Check className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {escondido > 0 && (
        <p className="mt-3 text-xs text-muted-foreground/70">
          +{escondido} escondida{escondido > 1 ? "s" : ""} para não sobrecarregar.
        </p>
      )}
    </section>
  );
}

/* ---------------- LISTA DE COMPRAS ---------------- */

function SecaoLista({
  itensPorCategoria,
  total,
}: {
  itensPorCategoria: Record<string, Array<{ id: string; descricao: string; categoria: string }>>;
  total: number;
}) {
  const qc = useQueryClient();

  return (
    <section>
      <RotuloSecao label="Lista de compras" />
      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border/60 bg-surface/30 px-5 py-6 text-sm text-muted-foreground">
          Nada na lista.
        </p>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-surface/40 p-5">
          <div className="space-y-6">
            {Object.entries(itensPorCategoria).map(([categoria, itens], idx) => (
              <div key={categoria}>
                <span
                  className={`inline-block border-b pb-1 text-[10px] font-bold uppercase tracking-widest ${
                    idx === 0
                      ? "border-ember/60 text-ember"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {categoria}
                </span>
                <ul className="mt-3 space-y-1">
                  {itens.map((item) => (
                    <li
                      key={item.id}
                      className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-foreground/85 hover:bg-surface"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="size-4 shrink-0 rounded-sm border border-border" />
                        <span className="truncate">{item.descricao}</span>
                      </div>
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={async () => {
                            await marcarItemComprado(item.id);
                            qc.invalidateQueries({ queryKey: ["itens_lista"] });
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-ember hover:text-ember-foreground"
                          aria-label="Comprei"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await removerItemLista(item.id);
                            qc.invalidateQueries({ queryKey: ["itens_lista"] });
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                          aria-label="Remover"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Ações do header ---------------- */

function BotaoSair() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <button
      onClick={sair}
      className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      aria-label="Sair"
      title="Sair"
    >
      <LogOut className="size-4" />
    </button>
  );
}

function NovaTarefaBotao() {
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TipoDemanda>("tarefa_rotina");
  const [prazo, setPrazo] = useState("");
  const qc = useQueryClient();

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) return;
    const cadencia = TIPOS_TAREFA.find((t) => t.value === tipo)?.cadencia ?? 60;
    await criarTarefa({
      descricao_limpa: descricao.trim(),
      tipo_demanda: tipo,
      prazo_estimado: prazo ? new Date(prazo).toISOString() : null,
      cadencia_alerta_minutos: cadencia,
    });
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    setDescricao("");
    setPrazo("");
    setAberto(false);
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
      >
        <Plus className="size-4" /> <span className="hidden sm:inline">Tarefa</span>
      </button>
      {aberto && (
        <Modal titulo="Nova tarefa" onClose={() => setAberto(false)}>
          <form onSubmit={salvar} className="space-y-3">
            <input
              autoFocus
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Lançar frequência do 9º ano"
              className="w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
            />
            <div className="flex gap-2">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoDemanda)}
                className="flex-1 rounded-lg bg-input px-3 py-2.5 text-sm"
              >
                {TIPOS_TAREFA.filter((t) => t.value !== "lista_compras").map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="flex-1 rounded-lg bg-input px-3 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-ember px-4 py-2.5 text-sm font-bold text-ember-foreground hover:brightness-110"
            >
              Registrar
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function NovoItemBotao() {
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<string>("Supermercado");
  const qc = useQueryClient();

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) return;
    await criarItemLista({ descricao: descricao.trim(), categoria });
    qc.invalidateQueries({ queryKey: ["itens_lista"] });
    setDescricao("");
    setAberto(false);
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
      >
        <Plus className="size-4" /> <span className="hidden sm:inline">Item</span>
      </button>
      {aberto && (
        <Modal titulo="Novo item da lista" onClose={() => setAberto(false)}>
          <form onSubmit={salvar} className="space-y-3">
            <input
              autoFocus
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Pó de café"
              className="w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
            />
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full rounded-lg bg-input px-3 py-2.5 text-sm"
            >
              {CATEGORIAS_LISTA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-ember px-4 py-2.5 text-sm font-bold text-ember-foreground hover:brightness-110"
            >
              Adicionar
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ---------------- Triagem IA ---------------- */

function TriagemBotao() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [processando, setProcessando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [imagemBase64, setImagemBase64] = useState<string | null>(null);
  const [imagemMime, setImagemMime] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState<"webm" | "mp4" | "m4a" | null>(null);
  const [gravando, setGravando] = useState(false);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const triar = useServerFn(triarMensagem);
  const qc = useQueryClient();

  function limpar() {
    setTexto("");
    setImagemBase64(null);
    setImagemMime(null);
    setAudioBase64(null);
    setAudioFormat(null);
    setFeedback(null);
  }

  async function pickImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setImagemBase64(b64);
    setImagemMime(f.type || "image/jpeg");
  }

  async function toggleGravacao() {
    if (gravando) {
      gravadorRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const buf = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        setAudioBase64(b64);
        setAudioFormat(mime.includes("webm") ? "webm" : "m4a");
        setGravando(false);
      };
      gravadorRef.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      setFeedback("Sem acesso ao microfone.");
    }
  }

  async function enviar() {
    if (!texto.trim() && !imagemBase64 && !audioBase64) {
      setFeedback("Escreva algo, anexe imagem ou grave um áudio.");
      return;
    }
    setProcessando(true);
    setFeedback(null);
    try {
      const audio_format_final =
        audioFormat === "mp4" ? "m4a" : (audioFormat ?? undefined);
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;
      if (!user_id) throw new Error("Sessão expirada — faça login de novo.");
      const res = await triar({
        data: {
          texto,
          origem: "manual",
          imagem_base64: imagemBase64 ?? undefined,
          imagem_mime: imagemMime ?? undefined,
          audio_base64: audioBase64 ?? undefined,
          audio_format: audio_format_final,
          user_id,
        },
      });
      if (res.ruido) {
        setFeedback("Kiah entendeu como ruído — nada acionável.");
      } else {
        setFeedback(`✓ ${res.criados} registro(s) criado(s).`);
      }
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["itens_lista"] });
      setTimeout(() => {
        setAberto(false);
        limpar();
      }, 900);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Falha na triagem.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-ember px-3 py-1.5 text-sm font-medium text-ember transition-colors hover:bg-ember/10 sm:px-4 sm:py-2"
      >
        <Sparkles className="size-4" /> Triar
      </button>
      {aberto && (
        <Modal
          titulo="Nova entrada bruta"
          onClose={() => {
            setAberto(false);
            limpar();
          }}
        >
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Jogue tudo aqui — texto desconexo, foto de uma lista, ou áudio.
              Kiah classifica e grava.
            </p>
            <textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder="ex: preciso lançar frequência do 9B até amanhã, e comprar pó de café e sabão em pó"
              className="w-full resize-none rounded-lg bg-input px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
            />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs hover:border-muted-foreground">
                <ImageIcon className="size-3.5" />
                {imagemBase64 ? "Imagem anexada" : "Anexar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={pickImagem}
                />
              </label>
              <button
                type="button"
                onClick={toggleGravacao}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                  gravando
                    ? "bg-ember text-ember-foreground"
                    : "border border-border bg-surface hover:border-muted-foreground"
                }`}
              >
                <Mic className="size-3.5" />
                {gravando
                  ? "Parar gravação"
                  : audioBase64
                    ? "Regravar áudio"
                    : "Gravar áudio"}
              </button>
              {(imagemBase64 || audioBase64) && (
                <button
                  type="button"
                  onClick={() => {
                    setImagemBase64(null);
                    setImagemMime(null);
                    setAudioBase64(null);
                    setAudioFormat(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:border-muted-foreground"
                >
                  <X className="size-3.5" /> Limpar anexos
                </button>
              )}
            </div>
            {feedback && (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
                {feedback}
              </p>
            )}
            <button
              onClick={enviar}
              disabled={processando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ember px-4 py-2.5 text-sm font-bold text-ember-foreground hover:brightness-110 disabled:opacity-60"
            >
              {processando ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Kiah pensando…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Triar com IA
                </>
              )}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- primitivos ---------------- */

function Modal({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-focus"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{titulo}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RotuloSecao({ label }: { label: string }) {
  return (
    <p className="font-display text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
      {label}
    </p>
  );
}

function BotaoSecundario({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-background px-5 py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground sm:py-5"
    >
      {children}
    </button>
  );
}

function rotuloTipo(t: TipoDemanda) {
  return TIPOS_TAREFA.find((x) => x.value === t)?.label ?? t;
}

function formatarPrazo(iso: string) {
  const d = new Date(iso);
  const agora = new Date();
  const mesmoDia = d.toDateString() === agora.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return `hoje ${hora}`;
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  if (d.toDateString() === amanha.toDateString()) return `amanhã ${hora}`;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function saudacaoHora() {
  const h = new Date().getHours();
  if (h < 5) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
