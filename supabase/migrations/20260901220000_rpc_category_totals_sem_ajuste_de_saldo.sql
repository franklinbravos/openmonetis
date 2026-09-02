-- Ajuste de saldo fora dos totais por categoria.
--
-- O ajuste é andaime de conciliação: ele existe para impor a abertura que o
-- extrato declara enquanto os meses anteriores não foram importados, e some
-- quando eles entram. Contá-lo como receita ou despesa inventa dinheiro — na
-- conta Nubank, importar agosto sem os meses de trás produz um ajuste de
-- R$ 39.905,96 que nunca entrou na conta, e ele caía inteiro em "Outras
-- receitas" nos relatórios de categoria.
--
-- Casa pelo nome, e não por anotação, para valer também nos ajustes já gravados.

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
    AND lower(btrim(l.nome)) <> 'ajuste de saldo'
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
