-- RPCs de cartões, faturas e notificações (Bloco 2).
-- Agregações migradas do drizzle-bridge para funções SQL nativas.
-- SECURITY DEFINER bypassa RLS: toda função filtra por p_user_id.

-- 1. Limite em uso por cartão (exclui faturas pagas e recorrentes futuras)
CREATE OR REPLACE FUNCTION public.get_card_usage(p_user_id text)
RETURNS TABLE(card_id uuid, total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.cartao_id AS card_id,
    COALESCE(SUM(l.valor), 0) AS total
  FROM public.lancamentos l
  LEFT JOIN public.faturas f
    ON f.user_id = l.user_id
   AND f.cartao_id = l.cartao_id
   AND f.periodo = l.periodo
  WHERE l.user_id = p_user_id
    AND l.cartao_id IS NOT NULL
    AND (f.status_pagamento IS NULL OR f.status_pagamento <> 'pago')
    AND (l.condicao <> 'Recorrente' OR l.data_compra <= current_date)
  GROUP BY l.cartao_id;
$$;

REVOKE ALL ON FUNCTION public.get_card_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_usage(text) TO service_role;

-- 2. Total da fatura do período por cartão
CREATE OR REPLACE FUNCTION public.get_card_invoice_totals(p_user_id text, p_period text)
RETURNS TABLE(card_id uuid, total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.cartao_id AS card_id,
    COALESCE(SUM(l.valor), 0) AS total
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.periodo = p_period
  GROUP BY l.cartao_id;
$$;

REVOKE ALL ON FUNCTION public.get_card_invoice_totals(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_invoice_totals(text, text) TO service_role;

-- 3. Totais por período do carrossel de faturas de um cartão
CREATE OR REPLACE FUNCTION public.get_card_invoice_month_summaries(p_user_id text, p_card_id uuid)
RETURNS TABLE(periodo text, total_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.periodo AS periodo,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.cartao_id = p_card_id
  GROUP BY l.periodo;
$$;

REVOKE ALL ON FUNCTION public.get_card_invoice_month_summaries(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_invoice_month_summaries(text, uuid) TO service_role;

-- 4. Total de uma fatura (cartão + período)
CREATE OR REPLACE FUNCTION public.get_invoice_total(p_user_id text, p_card_id uuid, p_period text)
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
    AND l.periodo = p_period;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_total(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_total(text, uuid, text) TO service_role;

-- 5. Cota do admin pagador em uma fatura (usada no pagamento)
CREATE OR REPLACE FUNCTION public.get_invoice_admin_share(
  p_user_id text,
  p_card_id uuid,
  p_period text,
  p_admin_payer_id text
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
    AND l.pagador_id = p_admin_payer_id::uuid;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_admin_share(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_admin_share(text, uuid, text, text) TO service_role;

-- 6. Widget de faturas do dashboard
CREATE OR REPLACE FUNCTION public.get_dashboard_invoices(p_user_id text, p_period text)
RETURNS TABLE(
  invoice_id uuid,
  card_id uuid,
  card_name text,
  card_brand text,
  card_status text,
  logo text,
  due_day text,
  period text,
  payment_status text,
  invoice_created_at timestamptz,
  card_account_id uuid,
  total_amount numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id AS invoice_id,
    c.id AS card_id,
    c.nome AS card_name,
    c.bandeira AS card_brand,
    c.status AS card_status,
    c.logo AS logo,
    c.dt_vencimento AS due_day,
    f.periodo AS period,
    f.status_pagamento AS payment_status,
    f.created_at AS invoice_created_at,
    c.conta_id AS card_account_id,
    COALESCE(SUM(l.valor), 0) AS total_amount,
    COUNT(l.id) AS transaction_count
  FROM public.cartoes c
  LEFT JOIN public.faturas f
    ON f.cartao_id = c.id
   AND f.user_id = p_user_id
   AND f.periodo = p_period
  LEFT JOIN public.lancamentos l
    ON l.cartao_id = c.id
   AND l.user_id = p_user_id
   AND l.periodo = p_period
  WHERE c.user_id = p_user_id
  GROUP BY f.id, c.id, c.nome, c.bandeira, c.status, c.logo, c.dt_vencimento, c.conta_id, f.periodo, f.status_pagamento;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_invoices(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_invoices(text, text) TO service_role;

-- 7. Breakdown por pessoa da fatura (período atual + anterior)
CREATE OR REPLACE FUNCTION public.get_invoice_payer_breakdown(
  p_user_id text,
  p_period text,
  p_previous_period text
)
RETURNS TABLE(
  card_id uuid,
  period text,
  payer_id uuid,
  pagador_name text,
  pagador_avatar text,
  amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.cartao_id AS card_id,
    l.periodo AS period,
    l.pagador_id AS payer_id,
    p.nome AS pagador_name,
    p.avatar_url AS pagador_avatar,
    COALESCE(SUM(l.valor), 0) AS amount
  FROM public.lancamentos l
  LEFT JOIN public.pagadores p ON p.id = l.pagador_id
  WHERE l.user_id = p_user_id
    AND l.periodo IN (p_period, p_previous_period)
    AND l.cartao_id IS NOT NULL
  GROUP BY l.cartao_id, l.periodo, l.pagador_id, p.nome, p.avatar_url;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_payer_breakdown(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invoice_payer_breakdown(text, text, text) TO service_role;

-- 8. Faturas atrasadas (notificações)
CREATE OR REPLACE FUNCTION public.get_overdue_invoices(p_user_id text, p_current_period text)
RETURNS TABLE(
  invoice_id uuid,
  card_id uuid,
  card_name text,
  card_logo text,
  due_day text,
  period text,
  total_amount numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id AS invoice_id,
    c.id AS card_id,
    c.nome AS card_name,
    c.logo AS card_logo,
    c.dt_vencimento AS due_day,
    f.periodo AS period,
    COALESCE(SUM(l.valor), 0) AS total_amount,
    COUNT(l.id) AS transaction_count
  FROM public.faturas f
  INNER JOIN public.cartoes c ON c.id = f.cartao_id
  LEFT JOIN public.lancamentos l
    ON l.cartao_id = f.cartao_id
   AND l.periodo = f.periodo
   AND l.user_id = f.user_id
  WHERE f.user_id = p_user_id
    AND f.status_pagamento = 'pendente'
    AND f.periodo < p_current_period
  GROUP BY f.id, c.id, c.nome, c.logo, c.dt_vencimento, f.periodo;
$$;

REVOKE ALL ON FUNCTION public.get_overdue_invoices(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_overdue_invoices(text, text) TO service_role;

-- 9. Faturas de um período (atual ou próximo) para notificações
CREATE OR REPLACE FUNCTION public.get_period_invoice_totals(p_user_id text, p_period text)
RETURNS TABLE(
  invoice_id uuid,
  card_id uuid,
  card_name text,
  card_logo text,
  due_day text,
  period text,
  payment_status text,
  total_amount numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id AS invoice_id,
    c.id AS card_id,
    c.nome AS card_name,
    c.logo AS card_logo,
    c.dt_vencimento AS due_day,
    COALESCE(f.periodo, p_period) AS period,
    f.status_pagamento AS payment_status,
    COALESCE(SUM(l.valor), 0) AS total_amount,
    COUNT(l.id) AS transaction_count
  FROM public.cartoes c
  LEFT JOIN public.faturas f
    ON f.cartao_id = c.id
   AND f.user_id = p_user_id
   AND f.periodo = p_period
  LEFT JOIN public.lancamentos l
    ON l.cartao_id = c.id
   AND l.user_id = p_user_id
   AND l.periodo = p_period
  WHERE c.user_id = p_user_id
  GROUP BY f.id, c.id, c.nome, c.logo, c.dt_vencimento, f.periodo, f.status_pagamento;
$$;

REVOKE ALL ON FUNCTION public.get_period_invoice_totals(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_period_invoice_totals(text, text) TO service_role;

-- 10. Gasto por orçamento do período (notificações de orçamento)
CREATE OR REPLACE FUNCTION public.get_budget_spent(
  p_user_id text,
  p_period text,
  p_admin_payer_id text
)
RETURNS TABLE(
  orcamento_id uuid,
  category_id uuid,
  budget_amount numeric,
  period text,
  categoria_name text,
  spent_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id AS orcamento_id,
    b.categoria_id AS category_id,
    b.valor AS budget_amount,
    b.periodo AS period,
    c.nome AS categoria_name,
    COALESCE(SUM(ABS(l.valor)), 0) AS spent_amount
  FROM public.orcamentos b
  INNER JOIN public.categorias c ON c.id = b.categoria_id
  LEFT JOIN public.lancamentos l
    ON l.categoria_id = b.categoria_id
   AND l.user_id = b.user_id
   AND l.periodo = b.periodo
   AND l.tipo_transacao = 'Despesa'
   AND l.condicao <> 'cancelado'
   AND (p_admin_payer_id IS NULL OR l.pagador_id = p_admin_payer_id::uuid)
  WHERE b.user_id = p_user_id
    AND b.periodo = p_period
  GROUP BY b.id, b.valor, c.nome;
$$;

REVOKE ALL ON FUNCTION public.get_budget_spent(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_budget_spent(text, text, text) TO service_role;
