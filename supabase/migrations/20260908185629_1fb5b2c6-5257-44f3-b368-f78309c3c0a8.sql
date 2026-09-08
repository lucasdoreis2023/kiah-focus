
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS alertas_enviados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alertas_hoje integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alertas_dia_ref date,
  ADD COLUMN IF NOT EXISTS silenciada_ate timestamptz,
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'direto',
  ADD COLUMN IF NOT EXISTS subtipo text,
  ADD COLUMN IF NOT EXISTS recebida_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sugerida_em date;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS descricao_norm text
  GENERATED ALWAYS AS (lower(btrim(regexp_replace(descricao_limpa, '\s+', ' ', 'g')))) STORED;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS id_curto text
  GENERATED ALWAYS AS (left(id::text, 6)) STORED;

CREATE INDEX IF NOT EXISTS tarefas_id_curto_idx ON public.tarefas (id_curto);
CREATE INDEX IF NOT EXISTS tarefas_dedupe_idx ON public.tarefas (user_id, descricao_norm, status);

ALTER TABLE public.grupos_whatsapp
  ADD COLUMN IF NOT EXISTS temas text[] NOT NULL DEFAULT ARRAY[
    'aula','material','planejamento','prova','avaliação','reunião','prazo','documento','aluno','SEDU','AMA'
  ]::text[];

CREATE TABLE IF NOT EXISTS public.preferencias_alerta (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alertas_pausados boolean NOT NULL DEFAULT false,
  quiet_start smallint NOT NULL DEFAULT 21,
  quiet_end smallint NOT NULL DEFAULT 7,
  max_proativos_dia smallint NOT NULL DEFAULT 6,
  intervalo_min_minutos smallint NOT NULL DEFAULT 90,
  resumo_manha text NOT NULL DEFAULT '07:30',
  resumo_meiodia text NOT NULL DEFAULT '12:30',
  resumo_noite text NOT NULL DEFAULT '18:30',
  cobrar_fim_de_semana boolean NOT NULL DEFAULT false,
  temas_padrao_grupos text[] NOT NULL DEFAULT ARRAY[
    'aula','material','planejamento','prova','avaliação','reunião','prazo','documento','aluno','SEDU','AMA'
  ]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferencias_alerta TO authenticated;
GRANT ALL ON public.preferencias_alerta TO service_role;
ALTER TABLE public.preferencias_alerta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prefs own all" ON public.preferencias_alerta
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS prefs_touch_updated ON public.preferencias_alerta;
CREATE TRIGGER prefs_touch_updated BEFORE UPDATE ON public.preferencias_alerta
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

CREATE TABLE IF NOT EXISTS public.kiah_envios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tarefa_id uuid,
  tipo_envio text NOT NULL,
  motivo text,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  metadados jsonb
);

CREATE INDEX IF NOT EXISTS envios_user_data_idx ON public.kiah_envios_log (user_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS envios_tarefa_idx ON public.kiah_envios_log (tarefa_id, enviado_em DESC);

GRANT SELECT ON public.kiah_envios_log TO authenticated;
GRANT ALL ON public.kiah_envios_log TO service_role;
ALTER TABLE public.kiah_envios_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "envios own read" ON public.kiah_envios_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
