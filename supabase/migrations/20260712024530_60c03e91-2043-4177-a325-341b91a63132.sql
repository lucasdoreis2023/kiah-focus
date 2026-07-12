
ALTER TABLE public.tarefas ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.itens_lista ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.reivindicar_dados_orfaos(_whatsapp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  tarefas_migradas int := 0;
  itens_migrados int := 0;
  claim_wa boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;

  UPDATE public.tarefas SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS tarefas_migradas = ROW_COUNT;
  UPDATE public.itens_lista SET user_id = uid WHERE user_id IS NULL;
  GET DIAGNOSTICS itens_migrados = ROW_COUNT;

  IF _whatsapp IS NOT NULL AND _whatsapp <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE whatsapp_numero = _whatsapp AND id <> uid
    ) THEN
      UPDATE public.profiles
      SET whatsapp_numero = _whatsapp
      WHERE id = uid AND (whatsapp_numero IS NULL OR whatsapp_numero = _whatsapp);
      GET DIAGNOSTICS claim_wa = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tarefas_migradas', tarefas_migradas,
    'itens_migrados', itens_migrados,
    'whatsapp_vinculado', claim_wa
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reivindicar_dados_orfaos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reivindicar_dados_orfaos(text) TO authenticated;
