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
      // Se res.redirected === true, o navegador troca de página.
      // Se veio tokens (preview iframe), o onAuthStateChange redireciona.
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha inesperada.");
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Segundo cérebro
          </p>
          <h1 className="mt-2 text-4xl font-semibold flex items-center justify-center gap-2">
            <Sparkles className="size-6 text-primary" /> Kiah
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Entre para acessar suas tarefas, alertas e lista de compras.
          </p>
        </div>

        <div className="mt-8 rounded-2xl bg-surface p-6 shadow-focus">
          <button
            onClick={entrarComGoogle}
            disabled={carregando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
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
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-destructive-foreground/90">
              {erro}
            </p>
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground/70">
            Só você tem acesso ao seu Segundo Cérebro.
          </p>
        </div>
      </div>
    </div>
  );
}
