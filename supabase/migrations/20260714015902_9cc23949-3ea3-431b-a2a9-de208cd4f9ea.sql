
ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS confirmado boolean NOT NULL DEFAULT false;
ALTER TABLE public.itens_lista ADD COLUMN IF NOT EXISTS confirmado boolean NOT NULL DEFAULT false;
UPDATE public.tarefas SET confirmado = true WHERE confirmado = false;
UPDATE public.itens_lista SET confirmado = true WHERE confirmado = false;
CREATE INDEX IF NOT EXISTS idx_tarefas_confirmado ON public.tarefas (confirmado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_itens_confirmado ON public.itens_lista (confirmado, created_at DESC);
