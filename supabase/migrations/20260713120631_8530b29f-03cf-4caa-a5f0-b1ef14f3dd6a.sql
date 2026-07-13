CREATE TABLE public.webhook_eventos_processados (
  message_id text PRIMARY KEY,
  processado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.webhook_eventos_processados TO service_role;
ALTER TABLE public.webhook_eventos_processados ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acessado apenas pelo service_role no webhook.

CREATE INDEX idx_webhook_eventos_processado_em
  ON public.webhook_eventos_processados(processado_em);