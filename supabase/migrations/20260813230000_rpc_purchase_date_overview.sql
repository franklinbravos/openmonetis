-- Resumo mensal por data de compra (YYYY-MM) para a página de lançamentos.
-- Agrupa to_char(data_compra) em vez de periodo de competência.

CREATE OR REPLACE FUNCTION public.get_purchase_date_overview(
  p_user_id text,
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
    to_char(l.data_compra, 'YYYY-MM') AS periodo,
    l.tipo_transacao,
    COALESCE(SUM(CASE WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN 0 ELSE l.valor END), 0) AS total_amount,
    COALESCE(SUM(CASE WHEN l.anotacao ILIKE 'AUTO_REEMBOLSO:%' THEN l.valor ELSE 0 END), 0) AS refund_amount,
    a.excluir_do_saldo AS conta_excluir_do_saldo
  FROM public.lancamentos l
  LEFT JOIN public.contas a ON a.id = l.conta_id
  WHERE l.user_id = p_user_id
    AND l.data_compra >= (p_start_period || '-01')::date
    AND l.data_compra <= (
      date_trunc('month', (p_end_period || '-01')::date) + interval '1 month - 1 day'
    )::date
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
  GROUP BY to_char(l.data_compra, 'YYYY-MM'), l.tipo_transacao, a.excluir_do_saldo
  ORDER BY periodo, l.tipo_transacao
$$;

REVOKE ALL ON FUNCTION public.get_purchase_date_overview(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_date_overview(text, text, text) TO service_role;
