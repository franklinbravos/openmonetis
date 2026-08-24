-- Corrige também a DATA do débito na liquidação da fatura anterior.
--
-- A conferência aponta divergência de data — o arquivo diz quando o banco
-- recebeu — mas confirmar só ajustava status e valor. O usuário via um problema
-- apontado que a confirmação não resolvia.
--
-- A assinatura não muda: `p_previous_settlement` é jsonb, e a data entra como
-- chave nova (`data_lancamento`). O restante do corpo é idêntico à migration
-- 20260820020000 — derivado dela, não reescrito, para não perder a inserção com
-- colunas nomeadas.

CREATE OR REPLACE FUNCTION public.apply_invoice_import(
  p_user_id text,
  p_delete_ids uuid[] DEFAULT '{}',
  p_amount_edits jsonb DEFAULT '[]',
  p_installment_edits jsonb DEFAULT '[]',
  p_rows jsonb DEFAULT '[]',
  p_invoice_payments jsonb DEFAULT '[]',
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
      -- Valor e data do débito. `COALESCE` preserva o que já está gravado
      -- quando a chave não vem, para não zerar o outro campo sem intenção.
      UPDATE lancamentos
      SET valor = COALESCE(
            (p_previous_settlement->>'valor_lancamento')::numeric,
            valor
          ),
          data_compra = COALESCE(
            (p_previous_settlement->>'data_lancamento')::date,
            data_compra
          )
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
