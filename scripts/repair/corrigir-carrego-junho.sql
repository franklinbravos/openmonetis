-- Junho/2026 Nubank: o carrego declarado no arquivo estava vencido em R$ 2.500,00.
--
-- O resumo da fatura do banco fecha assim:
--   Fatura anterior          6.525,24
--   Pagamento recebido      -3.500,00
--   Saldo financiado         3.025,23
--   Juros                      575,40
--   IOF                         35,26
--   Compras                  4.174,50
--   Outros                     167,75
--   Total a pagar            7.978,14
--
-- O OFX declara "Valor pendente do mês anterior" com data 12/05 e valor
-- 5.525,23 — apurado depois do pagamento do vencimento (R$ 1.000,00) e ANTES do
-- de 18/05 (R$ 2.500,00). O banco não emite linha de crédito para esse segundo
-- pagamento; ele apenas reduz o saldo financiado, como o resumo mostra. O
-- OpenMonetis gravou a linha vencida, e a fatura ficou R$ 2.500,00 maior.
--
-- Os dois pagamentos são de MAIO: o banco aplicou os R$ 3.500,00 na fatura
-- anterior. Não houve amortização de junho.

BEGIN;

SELECT 'antes' AS quando, nome, valor, data_compra, anotacao
FROM lancamentos
WHERE nome ILIKE '%pendente do mês anterior%'
   OR anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-0%'
ORDER BY data_compra;

-- 1. O carrego passa a ser o saldo financiado que o banco declara.
UPDATE lancamentos
SET valor = -3025.23,
    -- O id sintético embute o valor; sem atualizá-lo, reprocessar o arquivo não
    -- reconheceria a linha e proporia inserir de novo.
    ofx_fit_id = '2026-05-12|3025.23|valor pendente do mês anterior (rotativo)'
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9'
  AND periodo = '2026-06'
  AND ofx_fit_id = '2026-05-12|5525.23|valor pendente do mês anterior (rotativo)';

-- 2. O pagamento de 18/05 não amortizou junho: ele abateu maio.
UPDATE lancamentos
SET anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-05:AMORT:2026-05-18'
WHERE anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06:AMORT:2026-05-18';

-- 3. O pagamento do vencimento de maio é o que o arquivo declara: R$ 1.000,00.
--    O centavo a mais vinha de `total − carrego` com o carrego errado.
UPDATE lancamentos
SET valor = -1000.00
WHERE anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-05'
  AND valor = -1000.01;

-- 4. O pagamento de junho é o "Total a pagar" do resumo do banco.
UPDATE lancamentos
SET valor = -7978.14
WHERE anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06';

-- 5. Maio consta paga em parte por R$ 3.500,00.
UPDATE faturas
SET status_pagamento = 'parcial', valor_pago = 3500.00
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9'
  AND periodo = '2026-05';

SELECT 'depois' AS quando, nome, valor, data_compra, anotacao
FROM lancamentos
WHERE nome ILIKE '%pendente do mês anterior%'
   OR anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-0%'
ORDER BY data_compra;

SELECT periodo, SUM(valor) AS total_fatura
FROM lancamentos
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo IN ('2026-05','2026-06')
GROUP BY periodo ORDER BY periodo;

SELECT 'pago em maio' AS o_que, SUM(valor) AS total
FROM lancamentos
WHERE anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-05%';

SELECT 'pago em junho' AS o_que, SUM(valor) AS total
FROM lancamentos
WHERE anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06%';

COMMIT;
