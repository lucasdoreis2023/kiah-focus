
CREATE TABLE public.mensagens_dialogo (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  jid text NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  push_name text,
  texto text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);
CREATE INDEX idx_msgdlg_pend ON public.mensagens_dialogo (user_id, jid, criado_em) WHERE processado_em IS NULL;
GRANT SELECT ON public.mensagens_dialogo TO authenticated;
GRANT ALL ON public.mensagens_dialogo TO service_role;
ALTER TABLE public.mensagens_dialogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialogo own read" ON public.mensagens_dialogo FOR SELECT TO authenticated USING (auth.uid() = user_id);
