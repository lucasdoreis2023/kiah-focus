import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() lê do storage local (sem network) — muito mais rápido
    // que getUser() em cada navegação. O token é validado no servidor
    // quando as server functions rodam via requireSupabaseAuth.
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      {/* espaço para a bottom nav mobile não cobrir o conteúdo */}
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </div>
      <MobileBottomNav />
    </>
  );
}
