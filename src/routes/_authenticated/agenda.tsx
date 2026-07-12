import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Clock, ArrowLeft, Trash2 } from "lucide-react";
import {
  tarefasPendentesQuery,
  concluirTarefa,
  adiarTarefa,
  removerTarefa,
  removerTarefas,
  removerTodasTarefasPendentes,
} from "@/lib/kiah-queries";
import { TIPOS_TAREFA, type Tarefa, type TipoDemanda } from "@/lib/kiah-types";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda — Kiah" },
      { name: "description", content: "Todas as tarefas pendentes ordenadas por prazo." },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(tarefasPendentesQuery),
  component: AgendaPage,
});

function AgendaPage() {
  const { data: tarefas } = useSuspenseQuery(tarefasPendentesQuery);
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => agrupar(tarefas), [tarefas]);
  const invalidar = () => qc.invalidateQueries({ queryKey: ["tarefas"] });

  const toggle = (id: string) =>
    setSelecionados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const todosMarcados = tarefas.length > 0 && selecionados.size === tarefas.length;
  const toggleTodos = () =>
    setSelecionados(todosMarcados ? new Set() : new Set(tarefas.map((t) => t.id)));

  const deletarSelecionadas = async () => {
    if (!selecionados.size) return;
    if (!confirm(`Deletar ${selecionados.size} tarefa(s) selecionada(s)?`)) return;
    await removerTarefas([...selecionados]);
    setSelecionados(new Set());
    invalidar();
  };

  const deletarTudo = async () => {
    if (!tarefas.length) return;
    if (!confirm(`Deletar TODAS as ${tarefas.length} tarefas pendentes?`)) return;
    await removerTodasTarefasPendentes();
    setSelecionados(new Set());
    invalidar();
  };

  return (
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Agenda</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tudo que está pendente, por prazo.
      </p>

      {tarefas.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={todosMarcados}
              onChange={toggleTodos}
              className="size-4 accent-ember"
            />
            <span className="text-muted-foreground">
              {selecionados.size > 0 ? `${selecionados.size} selecionada(s)` : "Selecionar todas"}
            </span>
          </label>
          <div className="ml-auto flex gap-2">
            <button
              onClick={deletarSelecionadas}
              disabled={!selecionados.size}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /> Deletar selecionadas
            </button>
            <button
              onClick={deletarTudo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="size-3.5" /> Deletar tudo
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-8">
        {(["Vencidas", "Hoje", "Amanhã", "Esta semana", "Depois", "Sem prazo"] as const).map((k) => {
          const lista = grupos[k];
          if (!lista.length) return null;
          return (
            <section key={k}>
              <h2 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
                {k} <span className="text-foreground/40">({lista.length})</span>
              </h2>
              <ul className="mt-3 space-y-2">
                {lista.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/50 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(t.id)}
                        onChange={() => toggle(t.id)}
                        className="size-4 shrink-0 accent-ember"
                        aria-label="Selecionar"
                      />
                      <div className="min-w-0">
                        <p className="font-display font-semibold">{t.descricao_limpa}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {rotulo(t.tipo_demanda)}
                          {t.prazo_estimado ? ` · ${fmtPrazo(t.prazo_estimado)}` : ""}
                          {t.adiamentos > 0 ? ` · adiada ${t.adiamentos}×` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={async () => {
                          await adiarTarefa(t.id, 60, t.adiamentos);
                          invalidar();
                        }}
                        className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                        aria-label="Adiar 1h"
                        title="Adiar 1h"
                      >
                        <Clock className="size-4" />
                      </button>
                      <button
                        onClick={async () => {
                          await concluirTarefa(t.id);
                          invalidar();
                        }}
                        className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-ember hover:bg-ember hover:text-ember-foreground"
                        aria-label="Concluir"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Deletar esta tarefa?")) return;
                          await removerTarefa(t.id);
                          setSelecionados((prev) => {
                            const n = new Set(prev);
                            n.delete(t.id);
                            return n;
                          });
                          invalidar();
                        }}
                        className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Deletar"
                        title="Deletar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {tarefas.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/60 bg-surface/30 px-5 py-10 text-center text-sm text-muted-foreground">
            Nada pendente.
          </p>
        )}
      </div>
    </div>
  );
}

type Bucket = "Vencidas" | "Hoje" | "Amanhã" | "Esta semana" | "Depois" | "Sem prazo";

function agrupar(ts: Tarefa[]): Record<Bucket, Tarefa[]> {
  const g: Record<Bucket, Tarefa[]> = {
    Vencidas: [], Hoje: [], Amanhã: [], "Esta semana": [], Depois: [], "Sem prazo": [],
  };
  const agora = new Date();
  const fimHoje = new Date(agora); fimHoje.setHours(23,59,59,999);
  const fimAmanha = new Date(fimHoje); fimAmanha.setDate(fimAmanha.getDate()+1);
  const fimSemana = new Date(fimHoje); fimSemana.setDate(fimSemana.getDate()+7);

  for (const t of ts) {
    if (!t.prazo_estimado) { g["Sem prazo"].push(t); continue; }
    const d = new Date(t.prazo_estimado);
    if (d < agora) g.Vencidas.push(t);
    else if (d <= fimHoje) g.Hoje.push(t);
    else if (d <= fimAmanha) g.Amanhã.push(t);
    else if (d <= fimSemana) g["Esta semana"].push(t);
    else g.Depois.push(t);
  }
  return g;
}

function rotulo(t: TipoDemanda) {
  return TIPOS_TAREFA.find((x) => x.value === t)?.label ?? t;
}
function fmtPrazo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}
