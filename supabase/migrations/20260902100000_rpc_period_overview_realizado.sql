-- Receitas e despesas separadas entre o que já entrou e o que ainda vai entrar.
--
-- O card de receitas mostrava o total do mês como "Entradas do período", mas o
-- total inclui o que ainda não foi pago: recorrência lançada para o mês, compra
-- de cartão de fatura em aberto, boleto a vencer. Em setembro/2026 isso exibia
-- R$ 33.000,00 de entrada num mês em que nada tinha entrado ainda.
--
-- Agrupar por `realizado` dá as duas leituras da mesma fonte: o que de fato
-- movimentou a conta e a previsão do mês.
--
-- Aproveita para tirar o ajuste de saldo, pelo mesmo motivo do
-- `get_category_totals`: ele é andaime de conciliação, não movimento.

-- A coluna nova muda o tipo de retorno, e CREATE OR REPLACE não muda assinatura.
DROP FUNCTION IF EXISTS public.get_period_overview(text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_period_overview(
  p_user_id text,
  p_admin_payer_id text,
  p_start_period text,
  p_end_period text
)
RETURNS TABLE (
  periodo text,
  tipo_transacao text,
  realizado boolean,
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
    COALESCE(l.realizado, false) AS realizado,
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
    AND lower(btrim(l.nome)) <> 'ajuste de saldo'
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
  GROUP BY l.periodo, l.tipo_transacao, COALESCE(l.realizado, false), a.excluir_do_saldo
  ORDER BY l.periodo, l.tipo_transacao
$$;

REVOKE ALL ON FUNCTION public.get_period_overview(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_period_overview(text, text, text, text) TO service_role;
