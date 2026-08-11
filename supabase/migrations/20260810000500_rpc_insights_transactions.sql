-- Bloco 5: Insights & Transações — agregações SQL como RPC functions nativas.
-- Padrão: SECURITY DEFINER + SET search_path = public + filtro por p_user_id + GRANT service_role.
-- Dinheiro como numeric, counts como bigint. Nomes reais das colunas (schema em src/db/schema.ts).

-- 1. Totais por tipo de transação e período (substitui as 4 consultas de totais do aggregate).
CREATE OR REPLACE FUNCTION public.get_insight_period_totals(
  p_user_id text,
  p_admin_payer_id text,
  p_periods text[]
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
    COALESCE(SUM(l.valor), 0) AS total_amount
  FROM public.lancamentos l
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = ANY(p_periods)
    AND l.tipo_transacao <> 'Transferência'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
  GROUP BY l.periodo, l.tipo_transacao
$$;

REVOKE ALL ON FUNCTION public.get_insight_period_totals(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_period_totals(text, text, text[]) TO service_role;

-- 2. Top 5 despesas por categoria (ordem ASC preservada do código atual — ver Observations).
CREATE OR REPLACE FUNCTION public.get_insight_top_expense_categories(
  p_user_id text,
  p_admin_payer_id text,
  p_period text
)
RETURNS TABLE (
  category_name text,
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cat.nome AS category_name,
    COALESCE(SUM(l.valor), 0) AS total
  FROM public.lancamentos l
  INNER JOIN public.categorias cat ON cat.id = l.categoria_id
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = p_period
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
    AND cat.tipo = 'despesa'
  GROUP BY cat.nome
  ORDER BY SUM(l.valor) ASC
  LIMIT 5
$$;

REVOKE ALL ON FUNCTION public.get_insight_top_expense_categories(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_top_expense_categories(text, text, text) TO service_role;

-- 3. Orçamentos do período com gasto por categoria (CASE WHEN de contas excluídas no spent).
CREATE OR REPLACE FUNCTION public.get_insight_budgets(
  p_user_id text,
  p_admin_payer_id text,
  p_period text
)
RETURNS TABLE (
  category_name text,
  budget_amount numeric,
  spent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cat.nome AS category_name,
    b.valor AS budget_amount,
    COALESCE(SUM(
      CASE
        WHEN l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false
        THEN l.valor
        ELSE 0
      END
    ), 0) AS spent
  FROM public.orcamentos b
  INNER JOIN public.categorias cat ON cat.id = b.categoria_id
  LEFT JOIN public.lancamentos l
    ON l.categoria_id = cat.id
    AND l.user_id = p_user_id
    AND l.periodo = p_period
    AND l.tipo_transacao = 'Despesa'
    AND l.pagador_id = p_admin_payer_id::uuid
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE b.user_id = p_user_id
    AND b.periodo = p_period
  GROUP BY cat.nome, b.valor
$$;

REVOKE ALL ON FUNCTION public.get_insight_budgets(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_budgets(text, text, text) TO service_role;

-- 4. Limite total e quantidade de cartões ativos.
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
    AND c.status = 'ativo'
$$;

REVOKE ALL ON FUNCTION public.get_insight_cards(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_cards(text) TO service_role;

-- 5. Saldo inicial total e quantidade de contas ativas não excluídas do saldo.
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
    AND c.status = 'ativa'
    AND c.excluir_do_saldo = false
$$;

REVOKE ALL ON FUNCTION public.get_insight_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_accounts(text) TO service_role;

-- 6. Ticket médio (avg(abs(valor))) e quantidade de lançamentos do período.
CREATE OR REPLACE FUNCTION public.get_insight_avg_ticket(
  p_user_id text,
  p_admin_payer_id text,
  p_period text
)
RETURNS TABLE (
  avg_amount numeric,
  transaction_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(AVG(ABS(l.valor)), 0) AS avg_amount,
    COUNT(*) AS transaction_count
  FROM public.lancamentos l
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = p_period
    AND l.tipo_transacao <> 'Transferência'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
$$;

REVOKE ALL ON FUNCTION public.get_insight_avg_ticket(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_avg_ticket(text, text, text) TO service_role;

-- 7. Totais por forma de pagamento (sum(abs(valor))), despesas do período.
CREATE OR REPLACE FUNCTION public.get_insight_payment_methods(
  p_user_id text,
  p_admin_payer_id text,
  p_period text
)
RETURNS TABLE (
  payment_method text,
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.forma_pagamento AS payment_method,
    COALESCE(SUM(ABS(l.valor)), 0) AS total
  FROM public.lancamentos l
  LEFT JOIN public.contas c ON c.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.pagador_id = p_admin_payer_id::uuid
    AND l.periodo = p_period
    AND l.tipo_transacao = 'Despesa'
    AND (l.anotacao IS NULL OR l.anotacao NOT LIKE 'AUTO_FATURA:%')
    AND (l.conta_id IS NULL OR c.excluir_do_saldo IS NULL OR c.excluir_do_saldo = false)
  GROUP BY l.forma_pagamento
$$;

REVOKE ALL ON FUNCTION public.get_insight_payment_methods(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insight_payment_methods(text, text, text) TO service_role;

-- 8. Estabelecimentos recentes para sugestão no filtro de transações.
CREATE OR REPLACE FUNCTION public.get_recent_establishments(
  p_user_id text
)
RETURNS TABLE (
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.nome AS name
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.data_compra >= current_date - interval '3 months'
    AND TRIM(l.nome) <> ''
    AND LOWER(l.nome) NOT LIKE 'pagamento fatura%'
  GROUP BY l.nome
  ORDER BY MAX(l.data_compra) DESC
  LIMIT 100
$$;

REVOKE ALL ON FUNCTION public.get_recent_establishments(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_establishments(text) TO service_role;

-- 9. Valor em aberto de um cartão (validateCardLimit): não realizado, com gate de recorrente futuro.
CREATE OR REPLACE FUNCTION public.get_card_open_amount(
  p_user_id text,
  p_card_id uuid,
  p_exclude_transaction_ids uuid[]
)
RETURNS TABLE (
  total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(l.valor), 0) AS total
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.cartao_id = p_card_id
    AND (l.realizado IS NULL OR l.realizado = false)
    AND (l.condicao <> 'Recorrente' OR l.data_compra <= current_date)
    AND (p_exclude_transaction_ids IS NULL OR NOT (l.id = ANY(p_exclude_transaction_ids)))
$$;

REVOKE ALL ON FUNCTION public.get_card_open_amount(text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_open_amount(text, uuid, uuid[]) TO service_role;

-- 10. Vínculos restantes de um anexo (escopo por p_user_id via join com anexos).
CREATE OR REPLACE FUNCTION public.get_attachment_remaining(
  p_user_id text,
  p_attachment_id uuid
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
    COUNT(*) AS total
  FROM public.lancamento_anexos la
  WHERE la.anexo_id = p_attachment_id
    AND EXISTS (
      SELECT 1
      FROM public.anexos a
      WHERE a.id = la.anexo_id
        AND a.user_id = p_user_id
    )
$$;

REVOKE ALL ON FUNCTION public.get_attachment_remaining(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attachment_remaining(text, uuid) TO service_role;

-- 11. Vínculos restantes de múltiplos anexos (cleanup após deletar transações).
CREATE OR REPLACE FUNCTION public.get_attachments_remaining_counts(
  p_user_id text,
  p_attachment_ids uuid[]
)
RETURNS TABLE (
  attachment_id uuid,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    la.anexo_id AS attachment_id,
    COUNT(*) AS total
  FROM public.lancamento_anexos la
  WHERE la.anexo_id = ANY(p_attachment_ids)
    AND EXISTS (
      SELECT 1
      FROM public.anexos a
      WHERE a.id = la.anexo_id
        AND a.user_id = p_user_id
    )
  GROUP BY la.anexo_id
$$;

REVOKE ALL ON FUNCTION public.get_attachments_remaining_counts(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attachments_remaining_counts(text, uuid[]) TO service_role;
