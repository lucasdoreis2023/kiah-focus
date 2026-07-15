import { Link } from "@tanstack/react-router";
import {
  CircleDot,
  Inbox,
  CalendarDays,
  ShoppingBasket,
  User,
} from "lucide-react";

const itens = [
  { to: "/", label: "Hoje", icon: CircleDot, exact: true },
  { to: "/caixa-entrada", label: "Inbox", icon: Inbox, exact: false },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, exact: false },
  { to: "/lista", label: "Lista", icon: ShoppingBasket, exact: false },
  { to: "/perfil", label: "Perfil", icon: User, exact: false },
] as const;

export function MobileBottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <ul className="grid grid-cols-5">
        {itens.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                activeOptions={{ exact: it.exact }}
                className="group relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground data-[status=active]:text-ember"
              >
                {/* barra ember superior no ativo */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 top-0 h-0.5 rounded-full bg-ember opacity-0 transition-opacity duration-200 group-data-[status=active]:opacity-100"
                />
                <Icon className="size-5 transition-transform duration-200 group-data-[status=active]:scale-110" />
                <span className="leading-none tracking-wide">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
