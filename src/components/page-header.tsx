import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Cabeçalho de página unificado para todas as sub-rotas autenticadas.
 * Padroniza: link Voltar, ícone temático, título e subtítulo.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  backTo = "/",
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  backTo?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 animate-fade-in">
      <Link
        to={backTo}
        className="group mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        Voltar
      </Link>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <div
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-surface/60 text-ember shadow-card sm:size-12"
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

/** Estado vazio consistente. */
export function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-surface/30 px-6 py-14 text-center animate-fade-in">
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-full border border-border bg-surface/70 text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
