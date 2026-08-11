-- RPCs de relatórios (estabelecimentos & cartões).
-- Agregações nativas no Postgres, SECURITY DEFINER, sempre filtradas por p_user_id.

CREATE OR REPLACE FUNCTION public.get_top_establishments(
  p_user_id text,
  p_admin_payer_id text,
  p_start_period text,
  p_end_period text
)
RETURNS TABLE (
  name text,
  count bigint,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.nome AS name,
    COUNT(*) AS count,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.periodo >= p_start_period
    AND l.periodo <= p_end_period
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT ILIKE 'AUTO_FATURA:%')
    AND (
      l.anotacao IS NULL
      OR l.anotacao <> 'saldo inicial'
      OR c.excluir_saldo_inicial_receitas IS NULL
      OR c.excluir_saldo_inicial_receitas = false
    )
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
  GROUP BY l.nome
  ORDER BY count DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_top_establishments(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_establishments(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_establishment_categories(
  p_user_id text,
  p_admin_payer_id text,
  p_start_period text,
  p_end_period text,
  p_names text[]
)
RETURNS TABLE (
  establishment_name text,
  category_id uuid,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.nome AS establishment_name,
    l.categoria_id AS category_id,
    COUNT(*) AS count
  FROM public.lancamentos l
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.periodo >= p_start_period
    AND l.periodo <= p_end_period
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT ILIKE 'AUTO_FATURA:%')
    AND (
      l.anotacao IS NULL
      OR l.anotacao <> 'saldo inicial'
      OR c.excluir_saldo_inicial_receitas IS NULL
      OR c.excluir_saldo_inicial_receitas = false
    )
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
    AND l.nome = ANY(p_names)
  GROUP BY l.nome, l.categoria_id;
$$;

REVOKE ALL ON FUNCTION public.get_establishment_categories(text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_establishment_categories(text, text, text, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.get_top_categories(
  p_user_id text,
  p_admin_payer_id text,
  p_start_period text,
  p_end_period text
)
RETURNS TABLE (
  category_id uuid,
  total_amount numeric,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.categoria_id AS category_id,
    SUM(l.valor) AS total_amount,
    COUNT(*) AS count
  FROM public.lancamentos l
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.periodo >= p_start_period
    AND l.periodo <= p_end_period
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT ILIKE 'AUTO_FATURA:%')
    AND (
      l.anotacao IS NULL
      OR l.anotacao <> 'saldo inicial'
      OR c.excluir_saldo_inicial_receitas IS NULL
      OR c.excluir_saldo_inicial_receitas = false
    )
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
  GROUP BY l.categoria_id
  ORDER BY total_amount ASC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_top_categories(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_categories(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_card_usage_by_period(
  p_user_id text,
  p_admin_payer_id text,
  p_period text,
  p_card_ids uuid[],
  p_apply_recurring_gate boolean
)
RETURNS TABLE (
  card_id uuid,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.cartao_id AS card_id,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.periodo = p_period
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.tipo_transacao = 'Despesa'
    AND l.cartao_id = ANY(p_card_ids)
    AND (
      p_apply_recurring_gate = false
      OR l.condicao <> 'Recorrente'
      OR l.data_compra <= CURRENT_DATE
    )
  GROUP BY l.cartao_id;
$$;

REVOKE ALL ON FUNCTION public.get_card_usage_by_period(text, text, text, uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_usage_by_period(text, text, text, uuid[], boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_card_monthly_usage(
  p_user_id text,
  p_admin_payer_id text,
  p_card_id uuid,
  p_start_period text,
  p_end_period text
)
RETURNS TABLE (
  period text,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.periodo AS period,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.cartao_id = p_card_id
    AND l.periodo >= p_start_period
    AND l.periodo <= p_end_period
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.tipo_transacao = 'Despesa'
  GROUP BY l.periodo
  ORDER BY l.periodo;
$$;

REVOKE ALL ON FUNCTION public.get_card_monthly_usage(text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_monthly_usage(text, text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_card_category_breakdown(
  p_user_id text,
  p_admin_payer_id text,
  p_card_id uuid,
  p_period text
)
RETURNS TABLE (
  category_id uuid,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.categoria_id AS category_id,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.cartao_id = p_card_id
    AND l.periodo = p_period
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.tipo_transacao = 'Despesa'
  GROUP BY l.categoria_id;
$$;

REVOKE ALL ON FUNCTION public.get_card_category_breakdown(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_category_breakdown(text, text, uuid, text) TO service_role;
