import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Entrar — Kiah" },
      {
        name: "description",
        content: "Entre no Kiah, seu Segundo Cérebro.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function entrarComGoogle() {
    setErro(null);
    setCarregando(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (res.error) {
        setErro(res.error.message || "Falha ao entrar com o Google.");
        setCarregando(false);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha inesperada.");
      setCarregando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-10">
      {/* glow ambiental */}
      <div className="pointer-events-none absolute -top-40 right-1/4 size-96 rounded-full bg-ember/20 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 size-96 rounded-full bg-ember/10 blur-[160px]" />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-ember/15 text-ember ring-1 ring-ember/30 ember-pulse">
            <Sparkles className="size-6" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-muted-foreground">
            Segundo cérebro
          </p>
          <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight text-foreground">
            Kiah
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Entre para acessar suas tarefas, alertas e lista de compras.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border/80 bg-card/80 p-6 shadow-focus backdrop-blur">
          <button
            onClick={entrarComGoogle}
            disabled={carregando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ember px-4 py-3.5 text-sm font-bold text-ember-foreground shadow-ember transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {carregando ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Abrindo Google…
              </>
            ) : (
              <>
                <LogIn className="size-4" /> Entrar com Google
              </>
            )}
          </button>
          {erro && (
            <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {erro}
            </p>
          )}
          <p className="mt-5 text-center text-xs text-muted-foreground/70">
            Só você tem acesso ao seu Segundo Cérebro.
          </p>
        </div>
      </div>
    </div>
  );
}
