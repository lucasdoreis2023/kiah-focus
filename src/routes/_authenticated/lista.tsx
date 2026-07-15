import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Trash2, ArrowLeft } from "lucide-react";
import {
  itensListaQuery,
  marcarItemComprado,
  removerItemLista,
  removerItensLista,
  removerTodosItensLista,
} from "@/lib/kiah-queries";

export const Route = createFileRoute("/_authenticated/lista")({
  head: () => ({
    meta: [
      { title: "Lista — Kiah" },
      { name: "description", content: "Lista de compras agrupada por categoria." },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(itensListaQuery),
  component: ListaPage,
});

function ListaPage() {
  const { data: itens } = useSuspenseQuery(itensListaQuery);
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const invalidar = () => qc.invalidateQueries({ queryKey: ["itens_lista"] });

  const porCategoria = itens.reduce<Record<string, typeof itens>>((acc, it) => {
    (acc[it.categoria] ??= []).push(it);
    return acc;
  }, {});

  const toggle = (id: string) =>
    setSelecionados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const todosMarcados = itens.length > 0 && selecionados.size === itens.length;
  const toggleTodos = () =>
    setSelecionados(todosMarcados ? new Set() : new Set(itens.map((i) => i.id)));

  const deletarSelecionados = async () => {
    if (!selecionados.size) return;
    if (!confirm(`Deletar ${selecionados.size} item(ns) selecionado(s)?`)) return;
    await removerItensLista([...selecionados]);
    setSelecionados(new Set());
    invalidar();
  };

  const deletarTudo = async () => {
    if (!itens.length) return;
    if (!confirm(`Deletar TODOS os ${itens.length} itens da lista?`)) return;
    await removerTodosItensLista();
    setSelecionados(new Set());
    invalidar();
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Lista de compras</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {itens.length} item{itens.length === 1 ? "" : "s"} em aberto.
      </p>

      {itens.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={todosMarcados}
              onChange={toggleTodos}
              className="size-4 accent-ember"
            />
            <span className="text-muted-foreground">
              {selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : "Selecionar todos"}
            </span>
          </label>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              onClick={deletarSelecionados}
              disabled={!selecionados.size}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-1.5"
            >
              <Trash2 className="size-3.5" /> Deletar selecionados
            </button>
            <button
              onClick={deletarTudo}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground sm:flex-none sm:py-1.5"
            >
              <Trash2 className="size-3.5" /> Deletar tudo
            </button>
          </div>
        </div>
      )}

      {itens.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border/60 bg-surface/30 px-5 py-10 text-center text-sm text-muted-foreground">
          Lista vazia.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {Object.entries(porCategoria).map(([cat, lista]) => (
            <section key={cat}>
              <h2 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-ember">
                {cat} <span className="text-muted-foreground">({lista.length})</span>
              </h2>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface/40">
                {lista.map((item) => (
                  <li key={item.id} className="group flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(item.id)}
                        onChange={() => toggle(item.id)}
                        className="size-4 shrink-0 accent-ember"
                        aria-label="Selecionar"
                      />
                      <div className="min-w-0">
                        <span className="block truncate text-sm">{item.descricao}</span>
                        {item.expira_em && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            expira {fmtExpira(item.expira_em)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={async () => {
                          await marcarItemComprado(item.id);
                          invalidar();
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-ember hover:text-ember-foreground"
                        aria-label="Comprei"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Deletar este item?")) return;
                          await removerItemLista(item.id);
                          setSelecionados((prev) => {
                            const n = new Set(prev);
                            n.delete(item.id);
                            return n;
                          });
                          invalidar();
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Remover"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtExpira(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
