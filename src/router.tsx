import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Dados costumam mudar via WhatsApp/cron; mantemos frescos por 30s
        // para evitar refetch a cada navegação enquanto ainda revalidamos
        // em background quando reabrimos a aba.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload em hover/foco (mobile: em toque) para transições instantâneas.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // Query controla freshness — mantém em 0 conforme guideline.
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
  });

  return router;
};
