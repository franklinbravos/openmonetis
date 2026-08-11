-- Corrige get_insight_accounts: status das contas é 'Ativa'/'Inativa' (caixa capitalizada),
-- não 'ativa'. O filtro case-sensitive 'ativa' retornava sempre 0 contas.
-- Usa NOT ILIKE 'inativa' (padrão case-insensitive do projeto).

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
