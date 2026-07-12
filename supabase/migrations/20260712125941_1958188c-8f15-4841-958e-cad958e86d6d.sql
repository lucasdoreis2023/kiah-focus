ALTER TABLE public.itens_lista
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS origem_grupo_jid TEXT,
  ADD COLUMN IF NOT EXISTS origem_grupo_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_itens_lista_expira_em
  ON public.itens_lista (expira_em)
  WHERE expira_em IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('kiah-limpar-itens-grupo-expirados')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'kiah-limpar-itens-grupo-expirados'
);

SELECT cron.schedule(
  'kiah-limpar-itens-grupo-expirados',
  '0 * * * *',
  $$
    DELETE FROM public.itens_lista
    WHERE expira_em IS NOT NULL
      AND expira_em <= now();
  $$
);