import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — Kiah" },
      { name: "description", content: "Dados da sua conta Kiah." },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState<string>("");
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email ?? "");
      setNome(
        (u.user_metadata?.full_name as string | undefined) ??
          (u.user_metadata?.name as string | undefined) ??
          "",
      );
      const { data: prof } = await supabase
        .from("profiles")
        .select("whatsapp_numero")
        .eq("id", u.id)
        .maybeSingle();
      setWhatsapp(prof?.whatsapp_numero ?? "");
    });
  }, []);

  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto max-w-2xl p-5 sm:p-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Perfil</h1>

      <div className="mt-8 space-y-4 rounded-xl border border-border bg-surface/40 p-6">
        <Campo label="Nome" valor={nome || "—"} />
        <Campo label="E-mail" valor={email || "—"} />
        <Campo label="WhatsApp" valor={whatsapp || "não vinculado"} />
      </div>

      <button
        onClick={sair}
        className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
      >
        <LogOut className="size-4" /> Sair
      </button>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{valor}</p>
    </div>
  );
}
