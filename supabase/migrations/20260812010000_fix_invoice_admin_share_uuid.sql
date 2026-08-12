-- Evita 22P02 no cast texto→uuid de p_admin_payer_id.
-- Tipa o parâmetro como uuid e compara direto com lancamentos.pagador_id.

DROP FUNCTION IF EXISTS public.get_invoice_admin_share(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_invoice_admin_share(
  p_user_id text,
  p_card_id uuid,
  p_period text,
  p_admin_payer_id uuid
)
RETURNS TABLE(total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(l.valor), 0) AS total
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.cartao_id = p_card_id
    AND l.periodo = p_period
    AND l.pagador_id = p_admin_payer_id;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_admin_share(text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_admin_share(text, uuid, text, uuid) TO service_role;
