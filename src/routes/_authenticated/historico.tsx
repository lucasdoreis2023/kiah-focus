import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Check, X, History } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
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
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <PageHeader
        icon={History}
        title="Histórico"
        subtitle="Últimas 100 tarefas concluídas ou descartadas."
      />

      {data.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nada no histórico ainda"
          subtitle="Assim que você concluir ou descartar uma tarefa, ela aparece aqui."
        />
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
