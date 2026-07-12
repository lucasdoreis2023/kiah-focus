
CREATE TYPE public.tipo_demanda AS ENUM ('tarefa_urgente','tarefa_rotina','lista_compras','academico');
CREATE TYPE public.origem_demanda AS ENUM ('whatsapp_pessoal','whatsapp_terceiros','konecta_i','manual');
CREATE TYPE public.status_demanda AS ENUM ('pendente','concluida','adiada','descartada');

CREATE TABLE public.tarefas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origem public.origem_demanda NOT NULL DEFAULT 'manual',
  tipo_demanda public.tipo_demanda NOT NULL DEFAULT 'tarefa_rotina',
  descricao_limpa TEXT NOT NULL,
  prazo_estimado TIMESTAMPTZ,
  cadencia_alerta_minutos INTEGER NOT NULL DEFAULT 60,
  status public.status_demanda NOT NULL DEFAULT 'pendente',
  adiamentos INTEGER NOT NULL DEFAULT 0,
  ultimo_alerta_em TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  contexto JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.itens_lista (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Supermercado',
  origem public.origem_demanda NOT NULL DEFAULT 'manual',
  comprado BOOLEAN NOT NULL DEFAULT false,
  comprado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO anon, authenticated;
GRANT ALL ON public.tarefas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens_lista TO anon, authenticated;
GRANT ALL ON public.itens_lista TO service_role;

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_lista ENABLE ROW LEVEL SECURITY;

-- Fase 1: painel single-user local. Autenticação vem na fase de WhatsApp.
CREATE POLICY "Kiah fase 1 - acesso total tarefas" ON public.tarefas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Kiah fase 1 - acesso total itens" ON public.itens_lista FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tocar_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_tarefas_updated BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();
CREATE TRIGGER trg_itens_updated BEFORE UPDATE ON public.itens_lista
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

CREATE INDEX idx_tarefas_status_prazo ON public.tarefas(status, prazo_estimado);
CREATE INDEX idx_itens_comprado ON public.itens_lista(comprado, categoria);

ALTER PUBLICATION supabase_realtime ADD TABLE public.tarefas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itens_lista;
