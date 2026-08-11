-- RPC functions para agregações de contas, saldo e overview do dashboard.
-- Substituem as agregações SQL que passavam pelo drizzle-bridge (quebradas para sum(case when)).
-- Todas as funções são SECURITY DEFINER e bypassam RLS: o isolamento entre usuários
-- é garantido pelo filtro obrigatório por p_user_id no WHERE.

-- ============================================================================
-- get_period_overview: receitas/despesas/reembolsos/transferências por período
-- (substitui a agregação de fetchDashboardPeriodOverview)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_period_overview(
  p_user_id text,
  p_admin_payer_id text,
  p_start_period text,
  p_end_period text
)
RETURNS TABLE (
  periodo text,
  tipo_transacao text,
  total_amount numeric,
  refund_amount numeric,
  conta_excluir_do_saldo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.periodo,
    l.tipo_transacao,
    COALESCE(SUM(CASE WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN 0 ELSE l.valor END), 0) AS total_amount,
    COALESCE(SUM(CASE WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN l.valor ELSE 0 END), 0) AS refund_amount,
    a.excluir_do_saldo AS conta_excluir_do_saldo
  FROM public.lancamentos l
  LEFT JOIN public.contas a ON a.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo >= p_start_period
    AND l.periodo <= p_end_period
    AND l.tipo_transacao IN ('Receita', 'Despesa', 'Transferência')
    AND (l.anotacao IS NULL OR l.anotacao NOT ILIKE 'AUTO_FATURA:%')
    AND (
      l.anotacao IS NULL
      OR l.anotacao <> 'saldo inicial'
      OR a.excluir_saldo_inicial_receitas IS NULL
      OR a.excluir_saldo_inicial_receitas = false
    )
    AND (
      l.conta_id IS NULL
      OR a.excluir_do_saldo IS NULL
      OR a.excluir_do_saldo = false
    )
  GROUP BY l.periodo, l.tipo_transacao, a.excluir_do_saldo
  ORDER BY l.periodo, l.tipo_transacao
$$;

REVOKE ALL ON FUNCTION public.get_period_overview(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_period_overview(text, text, text, text) TO service_role;

-- ============================================================================
-- get_account_balances: contas do usuário com saldo inicial + movimentações
-- (substitui a agregação de fetchDashboardAccounts, fetchAccountsByStatus e
--  a parte de contas do navbar)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_account_balances(
  p_user_id text,
  p_admin_payer_id text
)
RETURNS TABLE (
  id uuid,
  nome text,
  tipo_conta text,
  status text,
  anotacao text,
  logo text,
  saldo_inicial numeric,
  excluir_do_saldo boolean,
  excluir_saldo_inicial_receitas boolean,
  saldo_movimentacoes numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.nome,
    a.tipo_conta,
    a.status,
    a.anotacao,
    a.logo,
    a.saldo_inicial,
    a.excluir_do_saldo,
    a.excluir_saldo_inicial_receitas,
    COALESCE(
      SUM(CASE WHEN l.anotacao = 'saldo inicial' THEN 0 ELSE l.valor END),
      0
    ) AS saldo_movimentacoes
  FROM public.contas a
  LEFT JOIN public.lancamentos l
    ON l.conta_id = a.id
    AND l.user_id = p_user_id
    AND l.realizado = true
    AND l.pagador_id = p_admin_payer_id::uuid
  WHERE a.user_id = p_user_id
  GROUP BY
    a.id,
    a.nome,
    a.tipo_conta,
    a.status,
    a.anotacao,
    a.logo,
    a.saldo_inicial,
    a.excluir_do_saldo,
    a.excluir_saldo_inicial_receitas
$$;

REVOKE ALL ON FUNCTION public.get_account_balances(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_balances(text, text) TO service_role;

-- ============================================================================
-- get_account_statement_summaries: resumo por mês do extrato da conta
-- (substitui fetchAccountStatementMonthSummaries)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_account_statement_summaries(
  p_user_id text,
  p_account_id uuid,
  p_admin_payer_id text
)
RETURNS TABLE (
  periodo text,
  net_amount numeric,
  incomes numeric,
  expenses numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.periodo,
    COALESCE(SUM(CASE WHEN l.anotacao = 'saldo inicial' THEN 0 ELSE l.valor END), 0) AS net_amount,
    COALESCE(SUM(
      CASE
        WHEN l.anotacao = 'saldo inicial' THEN 0
        WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN 0
        WHEN l.tipo_transacao = 'Receita' THEN l.valor
        WHEN l.tipo_transacao = 'Transferência' AND l.valor > 0 THEN l.valor
        ELSE 0
      END
    ), 0) AS incomes,
    COALESCE(SUM(
      CASE
        WHEN l.anotacao = 'saldo inicial' THEN 0
        WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN ABS(l.valor)
        WHEN l.tipo_transacao = 'Despesa' THEN l.valor
        WHEN l.tipo_transacao = 'Transferência' AND l.valor < 0 THEN l.valor
        ELSE 0
      END
    ), 0) AS expenses
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.conta_id = p_account_id
    AND l.realizado = true
    AND l.pagador_id = p_admin_payer_id::uuid
  GROUP BY l.periodo
  ORDER BY l.periodo
$$;

REVOKE ALL ON FUNCTION public.get_account_statement_summaries(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_statement_summaries(text, uuid, text) TO service_role;

-- ============================================================================
-- get_account_statement_summary: resumo do período selecionado + movimentação
-- anterior (substitui as duas agregações de fetchAccountSummary)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_account_statement_summary(
  p_user_id text,
  p_account_id uuid,
  p_admin_payer_id text,
  p_period text
)
RETURNS TABLE (
  net_amount numeric,
  incomes numeric,
  expenses numeric,
  previous_movements numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN l.anotacao = 'saldo inicial' THEN 0 ELSE l.valor END), 0) AS net_amount,
    COALESCE(SUM(
      CASE
        WHEN l.anotacao = 'saldo inicial' THEN 0
        WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN 0
        WHEN l.tipo_transacao = 'Receita' THEN l.valor
        WHEN l.tipo_transacao = 'Transferência' AND l.valor > 0 THEN l.valor
        ELSE 0
      END
    ), 0) AS incomes,
    COALESCE(SUM(
      CASE
        WHEN l.anotacao = 'saldo inicial' THEN 0
        WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN ABS(l.valor)
        WHEN l.tipo_transacao = 'Despesa' THEN l.valor
        WHEN l.tipo_transacao = 'Transferência' AND l.valor < 0 THEN l.valor
        ELSE 0
      END
    ), 0) AS expenses,
    COALESCE(
      (
        SELECT SUM(CASE WHEN x.anotacao = 'saldo inicial' THEN 0 ELSE x.valor END)
        FROM public.lancamentos x
        WHERE x.user_id = p_user_id
          AND x.conta_id = p_account_id
          AND x.periodo < p_period
          AND x.realizado = true
          AND x.pagador_id = p_admin_payer_id::uuid
      ),
      0
    ) AS previous_movements
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.conta_id = p_account_id
    AND l.periodo = p_period
    AND l.realizado = true
    AND l.pagador_id = p_admin_payer_id::uuid
$$;

REVOKE ALL ON FUNCTION public.get_account_statement_summary(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_statement_summary(text, uuid, text, text) TO service_role;

-- ============================================================================
-- get_navbar_cards: total por cartão no período (parte de cards do navbar)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_navbar_cards(
  p_user_id text,
  p_period text
)
RETURNS TABLE (
  card_id uuid,
  card_name text,
  card_logo text,
  amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS card_id,
    c.nome AS card_name,
    c.logo AS card_logo,
    COALESCE(SUM(l.valor), 0) AS amount
  FROM public.cartoes c
  LEFT JOIN public.lancamentos l
    ON l.cartao_id = c.id
    AND l.user_id = p_user_id
    AND l.periodo = p_period
  WHERE c.user_id = p_user_id
    AND c.status NOT ILIKE 'inativo'
  GROUP BY c.id, c.nome, c.logo
  ORDER BY c.nome
$$;

REVOKE ALL ON FUNCTION public.get_navbar_cards(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_navbar_cards(text, text) TO service_role;
