import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tarefa } from "@/lib/kiah-types";

const historicoQuery = queryOptions({
  queryKey: ["tarefas", "historico"],
  queryFn: async (): Promise<Tarefa[]> => {
    const { data, error } = await supabase
      .from("tarefas")
      .select("*")
      .in("status", ["concluida", "descartada"])
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as Tarefa[];
  },
});

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Kiah" },
      { name: "description", content: "Últimas tarefas concluídas e descartadas." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(historicoQuery),
  component: HistoricoPage,
});

function HistoricoPage() {
  const { data } = useSuspenseQuery(historicoQuery);
  return (
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Histórico</h1>
      <p className="mt-1 text-sm text-muted-foreground">Últimas 100 tarefas fechadas.</p>

      {data.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border/60 bg-surface/30 px-5 py-10 text-center text-sm text-muted-foreground">
          Nada no histórico ainda.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface/40">
          {data.map((t) => {
            const feito = t.status === "concluida";
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${
                    feito ? "bg-ember/20 text-ember" : "bg-surface text-muted-foreground"
                  }`}
                >
                  {feito ? <Check className="size-4" /> : <X className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${feito ? "" : "line-through text-muted-foreground"}`}>
                    {t.descricao_limpa}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {feito ? "Concluída" : "Descartada"} · {fmt(t.concluida_em ?? t.updated_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
