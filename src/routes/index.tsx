import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Check,
  Clock,
  Plus,
  ShoppingBasket,
  Trash2,
  Zap,
  X,
  AlertTriangle,
} from "lucide-react";

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

export const Route = createFileRoute("/")({
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
        content: "Painel minimalista de foco: AGORA, A SEGUIR e Lista de Compras.",
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

function PainelKiah() {
  const qc = useQueryClient();
  const { data: tarefas } = useSuspenseQuery(tarefasPendentesQuery);
  const { data: itens } = useSuspenseQuery(itensListaQuery);

  // Realtime — mantém o painel sincronizado com WhatsApp/Konecta-i quando plugarmos.
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

  const [agora, ...restante] = tarefas;
  const aSeguir = restante.slice(0, 2);
  const restanteEscondido = Math.max(restante.length - 2, 0);

  const itensPorCategoria = itens.reduce<Record<string, typeof itens>>((acc, item) => {
    (acc[item.categoria] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-5xl px-6 pt-10 pb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Segundo cérebro
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Kiah</h1>
        </div>
        <div className="flex gap-2">
          <NovaTarefaBotao />
          <NovoItemBotao />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 space-y-10">
        <SecaoAgora tarefa={agora} />
        <SecaoASeguir tarefas={aSeguir} escondido={restanteEscondido} />
        <SecaoLista itensPorCategoria={itensPorCategoria} total={itens.length} />
      </main>
    </div>
  );
}

/* ---------------- AGORA ---------------- */

function SecaoAgora({ tarefa }: { tarefa: Tarefa | undefined }) {
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: ["tarefas"] });

  if (!tarefa) {
    return (
      <section>
        <RotuloSecao label="Agora" icone={<Zap className="size-3.5" />} />
        <div className="mt-3 rounded-3xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <p className="text-lg text-muted-foreground">Nada urgente agora.</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Respira. Kiah avisa quando algo entrar.
          </p>
        </div>
      </section>
    );
  }

  const urgente = tarefa.tipo_demanda === "tarefa_urgente" || tarefa.tipo_demanda === "academico";
  const adiadoDemais = tarefa.adiamentos >= 3;

  return (
    <section>
      <RotuloSecao label="Agora" icone={<Zap className="size-3.5" />} />
      <div
        className={`mt-3 rounded-3xl p-8 shadow-focus ${
          urgente
            ? "bg-urgent text-urgent-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] opacity-80">
          <span>{rotuloTipo(tarefa.tipo_demanda)}</span>
          {tarefa.prazo_estimado && (
            <span className="opacity-75">· {formatarPrazo(tarefa.prazo_estimado)}</span>
          )}
        </div>
        <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
          {tarefa.descricao_limpa}
        </h2>

        {adiadoDemais && (
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-black/20 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Lucas, você já adiou isso {tarefa.adiamentos} vezes. É uma tarefa curta —
              vamos resolver agora.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <BotaoAcao
            variante="solido"
            onClick={async () => {
              await concluirTarefa(tarefa.id);
              invalidar();
            }}
          >
            <Check className="size-4" /> Concluí
          </BotaoAcao>
          <BotaoAcao
            variante="fantasma"
            onClick={async () => {
              await adiarTarefa(tarefa.id, 15, tarefa.adiamentos);
              invalidar();
            }}
          >
            <Clock className="size-4" /> +15 min
          </BotaoAcao>
          <BotaoAcao
            variante="fantasma"
            onClick={async () => {
              await adiarTarefa(tarefa.id, 60, tarefa.adiamentos);
              invalidar();
            }}
          >
            <Clock className="size-4" /> +1 h
          </BotaoAcao>
          <BotaoAcao
            variante="fantasma"
            onClick={async () => {
              await descartarTarefa(tarefa.id);
              invalidar();
            }}
          >
            <X className="size-4" /> Desistir
          </BotaoAcao>
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
        <p className="mt-3 text-sm text-muted-foreground">Nada na fila.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {tarefas.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-base">{t.descricao_limpa}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rotuloTipo(t.tipo_demanda)}
                  {t.prazo_estimado ? ` · ${formatarPrazo(t.prazo_estimado)}` : ""}
                </p>
              </div>
              <button
                onClick={async () => {
                  await concluirTarefa(t.id);
                  qc.invalidateQueries({ queryKey: ["tarefas"] });
                }}
                className="shrink-0 rounded-full bg-surface-2 p-2 text-muted-foreground transition hover:bg-success hover:text-success-foreground"
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
      <RotuloSecao
        label="Lista de compras"
        icone={<ShoppingBasket className="size-3.5" />}
      />
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nada na lista.</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {Object.entries(itensPorCategoria).map(([categoria, itens]) => (
            <div key={categoria} className="rounded-2xl bg-surface p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {categoria}
              </p>
              <ul className="mt-3 space-y-1.5">
                {itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                  >
                    <span className="truncate text-sm">{item.descricao}</span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={async () => {
                          await marcarItemComprado(item.id);
                          qc.invalidateQueries({ queryKey: ["itens_lista"] });
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-success hover:text-success-foreground"
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
      )}
    </section>
  );
}

/* ---------------- Formulários (fase manual) ---------------- */

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
        className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm hover:bg-surface-2"
      >
        <Plus className="size-4" /> Tarefa
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
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
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
        className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm hover:bg-surface-2"
      >
        <Plus className="size-4" /> Item
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
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Adicionar
            </button>
          </form>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-focus"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium">{titulo}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-2"
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

function RotuloSecao({ label, icone }: { label: string; icone?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
      {icone}
      <span>{label}</span>
    </div>
  );
}

function BotaoAcao({
  children,
  onClick,
  variante,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variante: "solido" | "fantasma";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition";
  const estilo =
    variante === "solido"
      ? "bg-black/25 hover:bg-black/40"
      : "bg-white/10 hover:bg-white/20";
  return (
    <button onClick={onClick} className={`${base} ${estilo}`}>
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
