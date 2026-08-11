-- RPC functions para agregações de categorias, orçamentos e relatórios de categoria.
-- Padrão: SECURITY DEFINER + SET search_path = public; sempre filtrar por p_user_id.
-- Chamadas vindas de getSupabaseAdmin() (service_role).

-- 1. Total do período anterior do detalhe de categoria (fetchCategoryDetails).
--    Exclui notas AUTO_FATURA exceto na categoria de pagamento de fatura ("Pagamentos"),
--    e exclui lançamentos de "saldo inicial" quando a conta os omite de receitas.
CREATE OR REPLACE FUNCTION public.get_category_previous_total(
  p_user_id text,
  p_admin_payer_id text,
  p_category_id uuid,
  p_transaction_type text,
  p_period text
)
RETURNS TABLE (total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(l.valor), 0) AS total
  FROM public.lancamentos l
  INNER JOIN public.categorias c ON c.id = l.categoria_id
  LEFT JOIN public.contas fa ON fa.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.categoria_id = p_category_id
    AND l.tipo_transacao = p_transaction_type
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = p_period
    AND (
      c.nome = 'Pagamentos'
      OR l.anotacao IS NULL
      OR l.anotacao NOT LIKE 'AUTO_FATURA:%'
    )
    AND (
      l.anotacao IS NULL
      OR l.anotacao <> 'saldo inicial'
      OR fa.excluir_saldo_inicial_receitas IS NULL
      OR fa.excluir_saldo_inicial_receitas = false
    )
$$;

REVOKE ALL ON FUNCTION public.get_category_previous_total(text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_previous_total(text, text, uuid, text, text) TO service_role;

-- 2. Histórico mensal por categoria (fetchCategoryHistory): SUM(ABS(valor)) por categoria + período.
CREATE OR REPLACE FUNCTION public.get_category_history(
  p_user_id text,
  p_admin_payer_id text,
  p_periods text[]
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  category_icon text,
  period text,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS category_id,
    c.nome AS category_name,
    c.icone AS category_icon,
    l.periodo AS period,
    SUM(ABS(l.valor)) AS total_amount
  FROM public.lancamentos l
  INNER JOIN public.categorias c ON c.id = l.categoria_id
  WHERE l.user_id = p_user_id
    AND c.user_id = p_user_id
    AND l.periodo = ANY(p_periods)
    AND l.pagador_id = p_admin_payer_id::uuid
    AND (
      l.anotacao IS NULL
      OR l.anotacao NOT LIKE 'AUTO_FATURA:%'
    )
  GROUP BY c.id, c.nome, c.icone, l.periodo
$$;

REVOKE ALL ON FUNCTION public.get_category_history(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_history(text, text, text[]) TO service_role;

-- 3. Overview por categoria/condição do dashboard (fetchDashboardCategoryOverview).
--    Replica buildDashboardAdminFilters + excluir contas excluídas + exclusões
--    de AUTO_FATURA/AUTO_REEMBOLSO/saldo inicial aplicáveis por tipo de categoria.
CREATE OR REPLACE FUNCTION public.get_category_overview(
  p_user_id text,
  p_admin_payer_id text,
  p_periods text[]
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  category_icon text,
  category_type text,
  period text,
  condition text,
  total numeric,
  absolute_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS category_id,
    c.nome AS category_name,
    c.icone AS category_icon,
    c.tipo AS category_type,
    l.periodo AS period,
    l.condicao AS condition,
    COALESCE(SUM(l.valor), 0) AS total,
    COALESCE(SUM(ABS(l.valor)), 0) AS absolute_total
  FROM public.lancamentos l
  INNER JOIN public.categorias c ON c.id = l.categoria_id
  LEFT JOIN public.contas fa ON fa.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = ANY(p_periods)
    AND (
      l.conta_id IS NULL
      OR fa.excluir_do_saldo IS NULL
      OR fa.excluir_do_saldo = false
    )
    AND (
      (
        l.tipo_transacao = 'Despesa'
        AND c.tipo = 'despesa'
        AND (
          l.anotacao IS NULL
          OR l.anotacao NOT ILIKE 'AUTO_FATURA:%'
        )
      )
      OR
      (
        l.tipo_transacao = 'Receita'
        AND c.tipo = 'receita'
        AND (
          l.anotacao IS NULL
          OR l.anotacao NOT ILIKE 'AUTO_FATURA:%'
        )
        AND (
          l.anotacao IS NULL
          OR l.anotacao NOT ILIKE 'AUTO_REEMBOLSO:%'
        )
        AND (
          l.anotacao IS NULL
          OR l.anotacao <> 'saldo inicial'
          OR fa.excluir_saldo_inicial_receitas IS NULL
          OR fa.excluir_saldo_inicial_receitas = false
        )
      )
    )
  GROUP BY c.id, c.nome, c.icone, c.tipo, l.periodo, l.condicao
$$;

REVOKE ALL ON FUNCTION public.get_category_overview(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_overview(text, text, text[]) TO service_role;

-- 4. Gasto por categoria do período para orçamentos (fetchBudgetsForUser).
--    Exclui contas marcadas com excluir_do_saldo.
CREATE OR REPLACE FUNCTION public.get_budget_spent_by_category(
  p_user_id text,
  p_admin_payer_id text,
  p_period text,
  p_category_ids uuid[]
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
  LEFT JOIN public.contas fa ON fa.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = p_period
    AND l.tipo_transacao = 'Despesa'
    AND l.categoria_id = ANY(p_category_ids)
    AND (
      l.anotacao IS NULL
      OR l.anotacao NOT LIKE 'AUTO_FATURA:%'
    )
    AND (
      l.conta_id IS NULL
      OR fa.excluir_do_saldo IS NULL
      OR fa.excluir_do_saldo = false
    )
  GROUP BY l.categoria_id
$$;

REVOKE ALL ON FUNCTION public.get_budget_spent_by_category(text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_budget_spent_by_category(text, text, text, uuid[]) TO service_role;

-- 5. Gasto total de uma categoria no período para resumo de orçamento (fetchCategoryBudgetSummary).
CREATE OR REPLACE FUNCTION public.get_category_budget_summary(
  p_user_id text,
  p_category_id uuid,
  p_admin_payer_id text,
  p_period text
)
RETURNS TABLE (total_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  LEFT JOIN public.contas fa ON fa.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = p_period
    AND l.tipo_transacao = 'Despesa'
    AND l.categoria_id = p_category_id
    AND (
      l.anotacao IS NULL
      OR l.anotacao NOT LIKE 'AUTO_FATURA:%'
    )
    AND (
      l.conta_id IS NULL
      OR fa.excluir_do_saldo IS NULL
      OR fa.excluir_do_saldo = false
    )
$$;

REVOKE ALL ON FUNCTION public.get_category_budget_summary(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_budget_summary(text, uuid, text, text) TO service_role;

-- 6. Totais por categoria + período (fetchCategoryReport e fetchCategoryChartData).
--    p_use_abs=true soma ABS(valor) (gráfico); false soma valor (relatório, que aplica ABS no TS).
--    p_category_ids vazio ou nulo não filtra por categoria.
CREATE OR REPLACE FUNCTION public.get_category_totals(
  p_user_id text,
  p_admin_payer_id text,
  p_periods text[],
  p_category_ids uuid[],
  p_use_abs boolean
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  category_icon text,
  category_type text,
  period text,
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS category_id,
    c.nome AS category_name,
    c.icone AS category_icon,
    c.tipo AS category_type,
    l.periodo AS period,
    COALESCE(SUM(CASE WHEN p_use_abs THEN ABS(l.valor) ELSE l.valor END), 0) AS total
  FROM public.lancamentos l
  INNER JOIN public.categorias c ON c.id = l.categoria_id
  LEFT JOIN public.contas fa ON fa.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = ANY(p_periods)
    AND (c.tipo = 'despesa' OR c.tipo = 'receita')
    AND (
      l.anotacao IS NULL
      OR l.anotacao NOT LIKE 'AUTO_FATURA:%'
    )
    AND (
      l.conta_id IS NULL
      OR fa.excluir_do_saldo IS NULL
      OR fa.excluir_do_saldo = false
    )
    AND (
      p_category_ids IS NULL
      OR COALESCE(array_length(p_category_ids, 1), 0) = 0
      OR c.id = ANY(p_category_ids)
    )
  GROUP BY c.id, c.nome, c.icone, c.tipo, l.periodo
$$;

REVOKE ALL ON FUNCTION public.get_category_totals(text, text, text[], uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_category_totals(text, text, text[], uuid[], boolean) TO service_role;
