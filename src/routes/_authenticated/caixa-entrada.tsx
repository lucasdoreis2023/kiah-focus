import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ArrowLeft, Trash2, Inbox, ShoppingBasket, ClipboardList } from "lucide-react";
import {
  inboxTarefasQuery,
  inboxItensQuery,
  confirmarTarefa,
  confirmarTarefas,
  confirmarTodasTarefasInbox,
  confirmarItem,
  confirmarItens,
  confirmarTodosItensInbox,
  removerTarefa,
  removerItemLista,
} from "@/lib/kiah-queries";
import { TIPOS_TAREFA, type TipoDemanda } from "@/lib/kiah-types";

export const Route = createFileRoute("/_authenticated/caixa-entrada")({
  head: () => ({
    meta: [
      { title: "Caixa de Entrada — Kiah" },
      {
        name: "description",
        content:
          "Revise e confirme tarefas e itens capturados pela triagem antes que entrem no seu dia.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(inboxTarefasQuery),
      context.queryClient.ensureQueryData(inboxItensQuery),
    ]),
  component: CaixaEntradaPage,
});

function CaixaEntradaPage() {
  const { data: tarefas } = useSuspenseQuery(inboxTarefasQuery);
  const { data: itens } = useSuspenseQuery(inboxItensQuery);
  const qc = useQueryClient();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: ["itens_lista"] });
  };

  const total = tarefas.length + itens.length;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface/60 text-ember">
          <Inbox className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Caixa de Entrada</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Capturado pela triagem — confirme para entrar no fluxo.
          </p>
        </div>
      </div>

      {total === 0 && (
        <p className="mt-10 rounded-xl border border-dashed border-border/60 bg-surface/30 px-5 py-10 text-center text-sm text-muted-foreground">
          Nada aguardando revisão. Tudo em dia.
        </p>
      )}

      {/* ---------------- Tarefas ---------------- */}
      <SecaoTarefas
        tarefas={tarefas}
        onChanged={invalidar}
      />

      {/* ---------------- Itens de lista ---------------- */}
      <SecaoItens
        itens={itens}
        onChanged={invalidar}
      />
    </div>
  );
}

/* ==================== TAREFAS ==================== */

function SecaoTarefas({
  tarefas,
  onChanged,
}: {
  tarefas: { id: string; descricao_limpa: string; tipo_demanda: TipoDemanda; prazo_estimado: string | null; created_at: string }[];
  onChanged: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  if (!tarefas.length) return null;

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const todos = sel.size === tarefas.length;
  const toggleTodos = () => setSel(todos ? new Set() : new Set(tarefas.map((t) => t.id)));

  const confirmarSel = async () => {
    if (!sel.size) return;
    await confirmarTarefas([...sel]);
    setSel(new Set());
    onChanged();
  };

  const confirmarTudo = async () => {
    if (!tarefas.length) return;
    await confirmarTodasTarefasInbox();
    setSel(new Set());
    onChanged();
  };

  return (
    <section className="mt-10">
      <header className="mb-3 flex items-center gap-2">
        <ClipboardList className="size-4 text-ember" />
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
          Tarefas aguardando <span className="text-foreground/60">({tarefas.length})</span>
        </h2>
      </header>

      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={todos}
            onChange={toggleTodos}
            className="size-4 accent-ember"
          />
          <span className="text-muted-foreground">
            {sel.size > 0 ? `${sel.size} selecionada(s)` : "Selecionar todas"}
          </span>
        </label>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button
            onClick={confirmarSel}
            disabled={!sel.size}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs font-semibold text-ember hover:bg-ember hover:text-ember-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-1.5"
          >
            <Check className="size-3.5" /> Confirmar selecionadas
          </button>
          <button
            onClick={confirmarTudo}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-foreground hover:text-foreground sm:flex-none sm:py-1.5"
          >
            <Check className="size-3.5" /> Confirmar tudo
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {tarefas.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={sel.has(t.id)}
                onChange={() => toggle(t.id)}
                className="size-4 shrink-0 accent-ember"
                aria-label="Selecionar"
              />
              <div className="min-w-0">
                <p className="font-display font-semibold">{t.descricao_limpa}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rotulo(t.tipo_demanda)}
                  {t.prazo_estimado ? ` · ${fmtPrazo(t.prazo_estimado)}` : " · sem prazo"}
                  {` · capturada ${fmtRelativo(t.created_at)}`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={async () => {
                  await confirmarTarefa(t.id);
                  onChanged();
                }}
                className="grid size-9 place-items-center rounded-full border border-ember/40 bg-ember/10 text-ember hover:bg-ember hover:text-ember-foreground"
                aria-label="Confirmar"
                title="Confirmar"
              >
                <Check className="size-4" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Descartar esta tarefa?")) return;
                  await removerTarefa(t.id);
                  onChanged();
                }}
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                aria-label="Descartar"
                title="Descartar"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ==================== ITENS ==================== */

function SecaoItens({
  itens,
  onChanged,
}: {
  itens: { id: string; descricao: string; categoria: string; created_at: string }[];
  onChanged: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  if (!itens.length) return null;

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const todos = sel.size === itens.length;
  const toggleTodos = () => setSel(todos ? new Set() : new Set(itens.map((i) => i.id)));

  const confirmarSel = async () => {
    if (!sel.size) return;
    await confirmarItens([...sel]);
    setSel(new Set());
    onChanged();
  };

  const confirmarTudo = async () => {
    await confirmarTodosItensInbox();
    setSel(new Set());
    onChanged();
  };

  return (
    <section className="mt-10">
      <header className="mb-3 flex items-center gap-2">
        <ShoppingBasket className="size-4 text-ember" />
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
          Itens aguardando <span className="text-foreground/60">({itens.length})</span>
        </h2>
      </header>

      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={todos}
            onChange={toggleTodos}
            className="size-4 accent-ember"
          />
          <span className="text-muted-foreground">
            {sel.size > 0 ? `${sel.size} selecionado(s)` : "Selecionar todos"}
          </span>
        </label>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <button
            onClick={confirmarSel}
            disabled={!sel.size}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-xs font-semibold text-ember hover:bg-ember hover:text-ember-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-1.5"
          >
            <Check className="size-3.5" /> Confirmar selecionados
          </button>
          <button
            onClick={confirmarTudo}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-foreground hover:text-foreground sm:flex-none sm:py-1.5"
          >
            <Check className="size-3.5" /> Confirmar tudo
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {itens.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={sel.has(i.id)}
                onChange={() => toggle(i.id)}
                className="size-4 shrink-0 accent-ember"
                aria-label="Selecionar"
              />
              <div className="min-w-0">
                <p className="font-display font-semibold">{i.descricao}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {i.categoria || "Outros"} · capturado {fmtRelativo(i.created_at)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={async () => {
                  await confirmarItem(i.id);
                  onChanged();
                }}
                className="grid size-9 place-items-center rounded-full border border-ember/40 bg-ember/10 text-ember hover:bg-ember hover:text-ember-foreground"
                aria-label="Confirmar"
                title="Confirmar"
              >
                <Check className="size-4" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Descartar este item?")) return;
                  await removerItemLista(i.id);
                  onChanged();
                }}
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                aria-label="Descartar"
                title="Descartar"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ==================== helpers ==================== */

function rotulo(t: TipoDemanda) {
  return TIPOS_TAREFA.find((x) => x.value === t)?.label ?? t;
}

function fmtPrazo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}
