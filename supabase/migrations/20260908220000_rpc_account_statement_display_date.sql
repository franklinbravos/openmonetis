-- Extrato de conta: agrupa por vencimento (em aberto) ou data de pagamento (quitado).
-- O campo lancamentos.periodo continua sendo o período de fatura do cartão de crédito.

CREATE OR REPLACE FUNCTION public.lancamento_data_extrato_conta(
  p_realizado boolean,
  p_forma_pagamento text,
  p_data_compra date,
  p_data_vencimento date,
  p_dt_pagamento_boleto date
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_realizado = true THEN
      CASE
        WHEN p_forma_pagamento = 'Boleto' THEN COALESCE(p_dt_pagamento_boleto, p_data_compra)
        ELSE p_data_compra
      END
    ELSE COALESCE(p_data_vencimento, p_data_compra)
  END
$$;

CREATE OR REPLACE FUNCTION public.lancamento_periodo_extrato_conta(
  p_realizado boolean,
  p_forma_pagamento text,
  p_data_compra date,
  p_data_vencimento date,
  p_dt_pagamento_boleto date
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(
    public.lancamento_data_extrato_conta(
      p_realizado,
      p_forma_pagamento,
      p_data_compra,
      p_data_vencimento,
      p_dt_pagamento_boleto
    ),
    'YYYY-MM'
  )
$$;

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
    public.lancamento_periodo_extrato_conta(
      l.realizado,
      l.forma_pagamento,
      l.data_compra,
      l.data_vencimento,
      l.dt_pagamento_boleto
    ) AS periodo,
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
  GROUP BY 1
  ORDER BY 1
$$;

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
          AND x.realizado = true
          AND x.pagador_id = p_admin_payer_id::uuid
          AND public.lancamento_periodo_extrato_conta(
            x.realizado,
            x.forma_pagamento,
            x.data_compra,
            x.data_vencimento,
            x.dt_pagamento_boleto
          ) < p_period
      ),
      0
    ) AS previous_movements
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND l.conta_id = p_account_id
    AND l.realizado = true
    AND l.pagador_id = p_admin_payer_id::uuid
    AND public.lancamento_periodo_extrato_conta(
      l.realizado,
      l.forma_pagamento,
      l.data_compra,
      l.data_vencimento,
      l.dt_pagamento_boleto
    ) = p_period
$$;

REVOKE ALL ON FUNCTION public.lancamento_data_extrato_conta(boolean, text, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lancamento_data_extrato_conta(boolean, text, date, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.lancamento_periodo_extrato_conta(boolean, text, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lancamento_periodo_extrato_conta(boolean, text, date, date, date) TO service_role;
