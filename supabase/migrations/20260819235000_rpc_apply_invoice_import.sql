-- Aplicação atômica da importação de fatura.
--
-- POR QUE ESTA FUNÇÃO EXISTE
-- O acesso ao banco é feito pela API do Supabase (PostgREST), que é HTTP
-- stateless: não existe transação multi-statement. O `db.transaction()` do
-- bridge apenas invoca o callback — sem BEGIN, COMMIT ou ROLLBACK. A
-- importação faz seis escritas em sequência (apaga excedentes, corrige valores,
-- corrige parcelas, insere, atualiza status da fatura, marca como pago) e, se
-- qualquer passo falhasse, o que já rodou ficava gravado. Foi o que aconteceu
-- quando a violação do índice de FITID abortou a importação: a tela informou
-- que nada foi importado, mas as exclusões e correções já estavam aplicadas.
--
-- Uma função é um único statement para o cliente, logo é atômica: ou tudo é
-- gravado, ou nada é.
--
-- O QUE **NÃO** VEM PARA CÁ
-- Nenhuma regra de negócio. Pareamento de linhas, decisão de duplicata, regra
-- do FITID reaproveitado e fechamento continuam em TypeScript, cobertos por
-- testes. Aqui chega só o resultado já decidido: o que apagar, o que corrigir
-- e o que inserir.

-- Assinatura anterior desta função, de uma iteração descartada.
DROP FUNCTION IF EXISTS public.apply_invoice_import(
  text, uuid[], jsonb, jsonb, jsonb, uuid[]
);

CREATE OR REPLACE FUNCTION public.apply_invoice_import(
  p_user_id text,
  -- ids a remover (lançamentos em excesso na fatura)
  p_delete_ids uuid[] DEFAULT '{}',
  -- [{ "id": uuid, "valor": numeric }]
  p_amount_edits jsonb DEFAULT '[]',
  -- [{ "id": uuid, "parcela_atual": int, "qtde_parcela": int }]
  p_installment_edits jsonb DEFAULT '[]',
  -- linhas completas de `lancamentos` a inserir
  p_rows jsonb DEFAULT '[]',
  -- [{ "cartao_id": uuid, "periodo": text, "status_pagamento": text }]
  p_invoice_payments jsonb DEFAULT '[]'
)
RETURNS TABLE (inserted_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Toda cláusula carrega `user_id`: a função roda como SECURITY DEFINER, então
  -- é aqui que o escopo do dono do dado é garantido.

  IF array_length(p_delete_ids, 1) IS NOT NULL THEN
    DELETE FROM lancamentos
    WHERE user_id = p_user_id
      AND id = ANY(p_delete_ids);
  END IF;

  IF jsonb_array_length(p_amount_edits) > 0 THEN
    UPDATE lancamentos l
    SET valor = e.valor
    FROM (
      SELECT (item->>'id')::uuid AS id, (item->>'valor')::numeric AS valor
      FROM jsonb_array_elements(p_amount_edits) AS item
    ) e
    WHERE l.id = e.id
      AND l.user_id = p_user_id;
  END IF;

  IF jsonb_array_length(p_installment_edits) > 0 THEN
    UPDATE lancamentos l
    SET parcela_atual = e.parcela_atual,
        qtde_parcela = e.qtde_parcela
    FROM (
      SELECT (item->>'id')::uuid AS id,
             (item->>'parcela_atual')::smallint AS parcela_atual,
             (item->>'qtde_parcela')::smallint AS qtde_parcela
      FROM jsonb_array_elements(p_installment_edits) AS item
    ) e
    WHERE l.id = e.id
      AND l.user_id = p_user_id;
  END IF;

  IF jsonb_array_length(p_rows) > 0 THEN
    RETURN QUERY
    INSERT INTO lancamentos (
      condicao, nome, forma_pagamento, anotacao, valor, data_compra,
      tipo_transacao, qtde_parcela, periodo, parcela_atual, qtde_recorrencia,
      data_vencimento, dt_pagamento_boleto, realizado, dividido, antecipado,
      antecipacao_id, user_id, cartao_id, conta_id, categoria_id, pagador_id,
      series_id, split_group_id, transfer_id, ofx_fit_id, import_batch_id
    )
    SELECT
      r->>'condicao',
      r->>'nome',
      r->>'forma_pagamento',
      r->>'anotacao',
      (r->>'valor')::numeric,
      (r->>'data_compra')::date,
      r->>'tipo_transacao',
      (r->>'qtde_parcela')::smallint,
      r->>'periodo',
      (r->>'parcela_atual')::smallint,
      (r->>'qtde_recorrencia')::integer,
      (r->>'data_vencimento')::date,
      (r->>'dt_pagamento_boleto')::date,
      (r->>'realizado')::boolean,
      (r->>'dividido')::boolean,
      COALESCE((r->>'antecipado')::boolean, false),
      (r->>'antecipacao_id')::uuid,
      -- O dono vem do parâmetro, nunca do payload: linha do cliente não
      -- escolhe em nome de quem grava.
      p_user_id,
      (r->>'cartao_id')::uuid,
      (r->>'conta_id')::uuid,
      (r->>'categoria_id')::uuid,
      (r->>'pagador_id')::uuid,
      (r->>'series_id')::uuid,
      (r->>'split_group_id')::uuid,
      (r->>'transfer_id')::uuid,
      r->>'ofx_fit_id',
      r->>'import_batch_id'
    FROM jsonb_array_elements(p_rows) AS r
    RETURNING id;
  END IF;

  IF jsonb_array_length(p_invoice_payments) > 0 THEN
    -- A tabela tem índice único em (user_id, cartao_id, periodo), então o
    -- upsert substitui o "busca, decide, grava" que o TypeScript fazia em três
    -- idas ao banco — e que também não era atômico.
    INSERT INTO faturas (user_id, cartao_id, periodo, status_pagamento)
    SELECT p_user_id,
           (item->>'cartao_id')::uuid,
           item->>'periodo',
           item->>'status_pagamento'
    FROM jsonb_array_elements(p_invoice_payments) AS item
    ON CONFLICT (user_id, cartao_id, periodo)
    DO UPDATE SET status_pagamento = EXCLUDED.status_pagamento;

    UPDATE lancamentos l
    SET realizado = true
    FROM jsonb_array_elements(p_invoice_payments) AS item
    WHERE l.user_id = p_user_id
      AND l.cartao_id = (item->>'cartao_id')::uuid
      AND l.periodo = item->>'periodo';
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_invoice_import(
  text, uuid[], jsonb, jsonb, jsonb, jsonb
) TO authenticated, service_role;
