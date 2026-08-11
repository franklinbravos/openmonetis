-- Bloco 6 — Pessoas & Inbox: agregações migradas do bridge para RPC functions nativas.
-- Padrão: SECURITY DEFINER + SET search_path = public + filtro obrigatório por p_user_id.
-- Chamadas vêm de getSupabaseAdmin() (service_role).

-- Despesas por pessoa + período (widget de pessoas do dashboard)
CREATE OR REPLACE FUNCTION public.get_dashboard_payers(
  p_user_id text,
  p_periods text[]
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  avatar_url text,
  role text,
  period text,
  total_expenses numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.nome AS name,
    p.email,
    p.avatar_url,
    p.role,
    l.periodo AS period,
    COALESCE(SUM(ABS(l.valor)), 0) AS total_expenses
  FROM public.lancamentos l
  INNER JOIN public.pagadores p ON l.pagador_id = p.id
  LEFT JOIN public.contas a ON l.conta_id = a.id
  WHERE l.user_id = p_user_id
    AND l.periodo = ANY (p_periods)
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR a.excluir_do_saldo IS NULL OR a.excluir_do_saldo = false)
  GROUP BY p.id, p.nome, p.email, p.avatar_url, p.role, l.periodo
  ORDER BY SUM(ABS(l.valor)) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_payers(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_payers(text, text[]) TO service_role;

-- Breakdown mensal da pessoa (por forma de pagamento e tipo de transação)
CREATE OR REPLACE FUNCTION public.get_payer_monthly_breakdown(
  p_user_id text,
  p_payer_id uuid,
  p_period text
)
RETURNS TABLE (
  payment_method text,
  transaction_type text,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.forma_pagamento AS payment_method,
    l.tipo_transacao AS transaction_type,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  LEFT JOIN public.contas a ON l.conta_id = a.id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_payer_id
    AND l.periodo = p_period
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR a.excluir_do_saldo IS NULL OR a.excluir_do_saldo = false)
  GROUP BY l.forma_pagamento, l.tipo_transacao;
$$;

REVOKE ALL ON FUNCTION public.get_payer_monthly_breakdown(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payer_monthly_breakdown(text, uuid, text) TO service_role;

-- Histórico da pessoa (total por período e tipo de transação)
CREATE OR REPLACE FUNCTION public.get_payer_history(
  p_user_id text,
  p_payer_id uuid,
  p_start_period text,
  p_end_period text
)
RETURNS TABLE (
  period text,
  transaction_type text,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.periodo AS period,
    l.tipo_transacao AS transaction_type,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  LEFT JOIN public.contas a ON l.conta_id = a.id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_payer_id
    AND l.periodo >= p_start_period
    AND l.periodo <= p_end_period
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR a.excluir_do_saldo IS NULL OR a.excluir_do_saldo = false)
  GROUP BY l.periodo, l.tipo_transacao;
$$;

REVOKE ALL ON FUNCTION public.get_payer_history(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payer_history(text, uuid, text, text) TO service_role;

-- Uso de cartões da pessoa no período
CREATE OR REPLACE FUNCTION public.get_payer_card_usage(
  p_user_id text,
  p_payer_id uuid,
  p_period text
)
RETURNS TABLE (
  card_id uuid,
  card_name text,
  card_logo text,
  total_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.cartao_id AS card_id,
    c.nome AS card_name,
    c.logo AS card_logo,
    SUM(l.valor) AS total_amount
  FROM public.lancamentos l
  INNER JOIN public.cartoes c ON l.cartao_id = c.id
  LEFT JOIN public.contas a ON l.conta_id = a.id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_payer_id
    AND l.periodo = p_period
    AND l.forma_pagamento = 'Cartão de crédito'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR a.excluir_do_saldo IS NULL OR a.excluir_do_saldo = false)
  GROUP BY l.cartao_id, c.nome, c.logo;
$$;

REVOKE ALL ON FUNCTION public.get_payer_card_usage(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payer_card_usage(text, uuid, text) TO service_role;

-- Stats de boletos da pessoa no período (realizado null = pendente no mapeamento TS)
CREATE OR REPLACE FUNCTION public.get_payer_boleto_stats(
  p_user_id text,
  p_payer_id uuid,
  p_period text
)
RETURNS TABLE (
  is_settled boolean,
  total_amount numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.realizado AS is_settled,
    SUM(l.valor) AS total_amount,
    COUNT(l.id)::bigint AS total_count
  FROM public.lancamentos l
  LEFT JOIN public.contas a ON l.conta_id = a.id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_payer_id
    AND l.periodo = p_period
    AND l.forma_pagamento = 'Boleto'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR a.excluir_do_saldo IS NULL OR a.excluir_do_saldo = false)
  GROUP BY l.realizado;
$$;

REVOKE ALL ON FUNCTION public.get_payer_boleto_stats(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payer_boleto_stats(text, uuid, text) TO service_role;

-- Status de pagamento da pessoa (pago vs pendente, CASE WHEN de realizado)
CREATE OR REPLACE FUNCTION public.get_payer_payment_status(
  p_user_id text,
  p_payer_id uuid,
  p_period text
)
RETURNS TABLE (
  paid_amount numeric,
  paid_count bigint,
  pending_amount numeric,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN l.realizado = true THEN ABS(l.valor) ELSE 0 END), 0) AS paid_amount,
    SUM(CASE WHEN l.realizado = true THEN 1 ELSE 0 END)::bigint AS paid_count,
    COALESCE(SUM(CASE WHEN (l.realizado = false OR l.realizado IS NULL) THEN ABS(l.valor) ELSE 0 END), 0) AS pending_amount,
    SUM(CASE WHEN (l.realizado = false OR l.realizado IS NULL) THEN 1 ELSE 0 END)::bigint AS pending_count
  FROM public.lancamentos l
  LEFT JOIN public.contas a ON l.conta_id = a.id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_payer_id
    AND l.periodo = p_period
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR a.excluir_do_saldo IS NULL OR a.excluir_do_saldo = false);
$$;

REVOKE ALL ON FUNCTION public.get_payer_payment_status(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payer_payment_status(text, uuid, text) TO service_role;

-- Contagens por status do inbox
CREATE OR REPLACE FUNCTION public.get_inbox_status_counts(
  p_user_id text
)
RETURNS TABLE (
  status text,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.status,
    COUNT(i.id)::bigint AS total
  FROM public.pre_lancamentos i
  WHERE i.user_id = p_user_id
  GROUP BY i.status;
$$;

REVOKE ALL ON FUNCTION public.get_inbox_status_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_status_counts(text) TO service_role;

-- Contagem do inbox por status (source_app_name opcional)
CREATE OR REPLACE FUNCTION public.get_inbox_count(
  p_user_id text,
  p_status text,
  p_source_app_name text
)
RETURNS TABLE (
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(i.id)::bigint AS total
  FROM public.pre_lancamentos i
  WHERE i.user_id = p_user_id
    AND i.status = p_status
    AND (p_source_app_name IS NULL OR i.source_app_name = p_source_app_name);
$$;

REVOKE ALL ON FUNCTION public.get_inbox_count(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_count(text, text, text) TO service_role;
