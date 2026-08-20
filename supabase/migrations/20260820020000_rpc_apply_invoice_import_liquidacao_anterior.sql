-- Liquidação da fatura anterior na importação: pagamento parcial de cartão.
--
-- Acrescenta `p_previous_settlement` a `apply_invoice_import`. A informação de
-- como uma fatura foi paga chega no arquivo do mês SEGUINTE, na linha "valor
-- pendente do mês anterior" — então é ao importar junho que maio pode ser
-- corrigida. Precisa ser atômico junto com o resto da importação: metade
-- aplicada deixaria o mês anterior num estado pior do que o de partida.
--
-- A assinatura de 6 argumentos é removida: mantê-la criaria sobrecarga e o
-- PostgREST não saberia qual chamar.
--
-- O restante do corpo é idêntico à migration 20260819235000.

DROP FUNCTION IF EXISTS public.apply_invoice_import(
  text, uuid[], jsonb, jsonb, jsonb, jsonb
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
  p_invoice_payments jsonb DEFAULT '[]',
  -- { "cartao_id", "periodo", "status_pagamento", "valor_pago",
  --   "lancamento_id", "valor_lancamento" } da fatura ANTERIOR
  p_previous_settlement jsonb DEFAULT NULL
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
    -- `valor_pago` volta a nulo: fatura quitada por inteiro não tem valor
    -- parcial, e deixar o de um estado anterior daria número errado na tela.
    DO UPDATE SET status_pagamento = EXCLUDED.status_pagamento,
                  valor_pago = NULL;

    UPDATE lancamentos l
    SET realizado = true
    FROM jsonb_array_elements(p_invoice_payments) AS item
    WHERE l.user_id = p_user_id
      AND l.cartao_id = (item->>'cartao_id')::uuid
      AND l.periodo = item->>'periodo';
  END IF;

  -- Liquidação da fatura ANTERIOR, deduzida do arquivo desta.
  --
  -- Em cartão de crédito o pagamento parcial é possível: paga-se parte e o
  -- resto entra na fatura seguinte como "valor pendente do mês anterior", com
  -- juros e IOF. Essa informação só chega no arquivo do mês seguinte, então é
  -- na importação dele que o mês anterior pode ser corrigido — ele ficava
  -- marcado como pago por inteiro, com um débito na conta por um valor que
  -- nunca saiu dela.
  IF p_previous_settlement IS NOT NULL THEN
    INSERT INTO faturas (user_id, cartao_id, periodo, status_pagamento, valor_pago)
    SELECT p_user_id,
           (p_previous_settlement->>'cartao_id')::uuid,
           p_previous_settlement->>'periodo',
           p_previous_settlement->>'status_pagamento',
           (p_previous_settlement->>'valor_pago')::numeric
    ON CONFLICT (user_id, cartao_id, periodo)
    DO UPDATE SET status_pagamento = EXCLUDED.status_pagamento,
                  valor_pago = EXCLUDED.valor_pago;

    -- Corrige o débito na conta para o que realmente foi pago.
    IF p_previous_settlement->>'lancamento_id' IS NOT NULL THEN
      UPDATE lancamentos
      SET valor = (p_previous_settlement->>'valor_lancamento')::numeric
      WHERE user_id = p_user_id
        AND id = (p_previous_settlement->>'lancamento_id')::uuid;
    END IF;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_invoice_import(
  text, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated, service_role;
