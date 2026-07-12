import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Check, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  obterMeuPerfil,
  salvarMeuWhatsapp,
  removerMeuWhatsapp,
} from "@/lib/kiah-perfil.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — Kiah" },
      { name: "description", content: "Dados da sua conta Kiah e vínculo com WhatsApp." },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const carregar = useServerFn(obterMeuPerfil);
  const salvar = useServerFn(salvarMeuWhatsapp);
  const remover = useServerFn(removerMeuWhatsapp);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [novoNumero, setNovoNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const qc = useQueryClient();
  const navigate = useNavigate();

  async function recarregar() {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) return;
    setEmail(u.email ?? "");
    setNome(
      (u.user_metadata?.full_name as string | undefined) ??
        (u.user_metadata?.name as string | undefined) ??
        "",
    );
    const prof = await carregar({ data: undefined as never });
    setWhatsapp(prof?.whatsapp_numero ?? "");
    setNovoNumero(prof?.whatsapp_numero ?? "");
  }

  useEffect(() => {
    recarregar().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function vincular(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSalvando(true);
    try {
      const r = await salvar({ data: { numero: novoNumero } });
      setWhatsapp(r.numero);
      setNovoNumero(r.numero);
      setFeedback({ tipo: "ok", texto: "WhatsApp vinculado. Você já pode conversar com o Kiah." });
    } catch (err) {
      setFeedback({
        tipo: "erro",
        texto: err instanceof Error ? err.message : "Não foi possível salvar.",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function desvincular() {
    if (!confirm("Remover o vínculo do WhatsApp?")) return;
    setSalvando(true);
    try {
      await remover({ data: undefined as never });
      setWhatsapp("");
      setNovoNumero("");
      setFeedback({ tipo: "ok", texto: "Vínculo removido." });
    } catch (err) {
      setFeedback({
        tipo: "erro",
        texto: err instanceof Error ? err.message : "Falha ao remover.",
      });
    } finally {
      setSalvando(false);
    }
  }

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
      </div>

      {/* WhatsApp — autoatendimento */}
      <section className="mt-8 rounded-xl border border-border bg-surface/40 p-6">
        <div className="mb-1 flex items-center gap-2">
          <MessageCircle className="size-4 text-ember" />
          <h2 className="font-display text-lg font-bold">WhatsApp do Kiah</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Vincule seu número para conversar com o Kiah pelo WhatsApp. Ele vai
          reconhecer mensagens vindas desse número e gravar tarefas, lembretes e
          itens da lista sob a sua conta.
        </p>

        <form onSubmit={vincular} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Número (com DDD)
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
              placeholder="Ex: 11987654321"
              className="mt-1 w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Se não colocar 55 na frente, o Kiah adiciona (Brasil).
            </span>
          </label>

          {feedback && (
            <p
              className={`rounded-lg px-3 py-2 text-xs ${
                feedback.tipo === "ok"
                  ? "border border-ember/40 bg-ember/10 text-ember"
                  : "border border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {feedback.texto}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={salvando || !novoNumero.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2.5 text-sm font-bold text-ember-foreground hover:brightness-110 disabled:opacity-60"
            >
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {whatsapp ? "Atualizar número" : "Vincular WhatsApp"}
            </button>
            {whatsapp && (
              <button
                type="button"
                onClick={desvincular}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" /> Desvincular
              </button>
            )}
          </div>

          {whatsapp && (
            <p className="pt-2 text-xs text-muted-foreground">
              Vínculo ativo: <span className="font-mono text-foreground">+{whatsapp}</span>
            </p>
          )}
        </form>

        <div className="mt-6 rounded-lg border border-border bg-background/60 p-4 text-xs text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">Como usar</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Envie texto, áudio ou foto — o Kiah tria e grava.</li>
            <li>Comandos rápidos: <code>hoje</code>, <code>amanhã</code>, <code>semana</code>.</li>
            <li>Fechar tarefa: <code>feito abc123</code> · adiar: <code>adiar abc123 30</code>.</li>
            <li>Comprei um item: <code>comprei café</code>.</li>
          </ul>
        </div>
      </section>

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
