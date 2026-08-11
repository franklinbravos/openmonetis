-- Corrige get_insight_cards: status dos cartões é 'Ativo'/'Inativo' (caixa capitalizada),
-- não 'ativo'. O filtro case-sensitive 'ativo' retornava sempre 0 cartões.
-- Usa NOT ILIKE 'inativo' (mesmo padrão de get_navbar_cards).

CREATE OR REPLACE FUNCTION public.get_insight_cards(
  p_user_id text
)
RETURNS TABLE (
  total_limit numeric,
  card_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(c.limite), 0) AS total_limit,
    COUNT(*) AS card_count
  FROM public.cartoes c
  WHERE c.user_id = p_user_id
    AND c.status NOT ILIKE 'inativo'
$$;

REVOKE ALL ON FUNCTION public.get_insight_cards(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_cards(text) TO service_role;

-- Corrige get_insight_accounts: status das contas é 'Ativa'/'Inativa', não 'ativa'.
CREATE OR REPLACE FUNCTION public.get_insight_accounts(
  p_user_id text
)
RETURNS TABLE (
  total_balance numeric,
  account_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(c.saldo_inicial), 0) AS total_balance,
    COUNT(*) AS account_count
  FROM public.contas c
  WHERE c.user_id = p_user_id
    AND c.status NOT ILIKE 'inativa'
    AND c.excluir_do_saldo = false
$$;

REVOKE ALL ON FUNCTION public.get_insight_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_accounts(text) TO service_role;
