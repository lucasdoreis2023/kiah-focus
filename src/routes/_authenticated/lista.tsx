import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, ArrowLeft } from "lucide-react";
import {
  itensListaQuery,
  marcarItemComprado,
  removerItemLista,
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

  const porCategoria = itens.reduce<Record<string, typeof itens>>((acc, it) => {
    (acc[it.categoria] ??= []).push(it);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Lista de compras</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {itens.length} item{itens.length === 1 ? "" : "s"} em aberto.
      </p>

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
                      <div className="size-4 shrink-0 rounded-sm border border-border" />
                      <span className="truncate text-sm">{item.descricao}</span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={async () => {
                          await marcarItemComprado(item.id);
                          qc.invalidateQueries({ queryKey: ["itens_lista"] });
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-ember hover:text-ember-foreground"
                        aria-label="Comprei"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={async () => {
                          await removerItemLista(item.id);
                          qc.invalidateQueries({ queryKey: ["itens_lista"] });
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
