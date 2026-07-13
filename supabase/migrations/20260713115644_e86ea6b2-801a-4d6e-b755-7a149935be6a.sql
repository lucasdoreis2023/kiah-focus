
CREATE TABLE public.grupos_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo_jid text NOT NULL,
  grupo_nome text,
  permitido boolean NOT NULL DEFAULT false,
  detectado_em timestamptz NOT NULL DEFAULT now(),
  ultima_mensagem_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, grupo_jid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_whatsapp TO authenticated;
GRANT ALL ON public.grupos_whatsapp TO service_role;

ALTER TABLE public.grupos_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grupos own all" ON public.grupos_whatsapp
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER grupos_whatsapp_touch
  BEFORE UPDATE ON public.grupos_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();

CREATE INDEX idx_grupos_whatsapp_user ON public.grupos_whatsapp(user_id, permitido);
