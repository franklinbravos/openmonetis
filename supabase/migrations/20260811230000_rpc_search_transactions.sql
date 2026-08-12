-- Busca de lançamentos por termo: retorna os IDs dos lançamentos que casam
-- nome, anotação, forma de pagamento ou condição (ILIKE nativo no Postgres).
-- O TS usa os IDs com `inArray(transactions.id, ids)` para combinar com os
-- demais filtros dinâmicos da página de transações.

CREATE OR REPLACE FUNCTION public.get_search_transaction_ids(
  p_user_id text,
  p_term text
)
RETURNS TABLE (
  id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.lancamentos l
  WHERE l.user_id = p_user_id
    AND (
      l.nome ILIKE p_term
      OR l.anotacao ILIKE p_term
      OR l.forma_pagamento ILIKE p_term
      OR l.condicao ILIKE p_term
    )
  LIMIT 1000
$$;

REVOKE ALL ON FUNCTION public.get_search_transaction_ids(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_search_transaction_ids(text, text) TO service_role;
