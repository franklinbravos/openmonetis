-- Julho/2026 Nubank: o "pagamento" de R$ 41,90 nunca existiu.
--
-- O arquivo de agosto declara uma única linha de rotativo:
--   13/07  Valor pendente do mês anterior   R$ 2.109,50
-- e o total declarado de julho é R$ 2.109,50. Idênticos: a fatura rolou
-- inteira, ninguém pagou nada.
--
-- O app calculou `pago = total − carrego` usando o total CADASTRADO
-- (R$ 2.151,40) em vez do declarado, e os R$ 41,90 de diferença viraram
-- pagamento. Prova: o lançamento não tem id de banco nem lote de importação —
-- foi o app que o criou.
--
-- Some o pagamento fantasma e julho volta a constar em aberto.

BEGIN;

SELECT 'antes' AS quando, l.valor, l.data_compra, l.ofx_fit_id, l.anotacao
FROM lancamentos l
WHERE l.anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-07';

SELECT 'antes' AS quando, status_pagamento, valor_pago FROM faturas
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07';

-- 1. Só remove se for mesmo o fantasma: valor exato e sem id de banco.
DELETE FROM lancamentos
WHERE anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-07'
  AND valor = -41.90
  AND ofx_fit_id IS NULL;

-- 2. Julho rolou inteira: em aberto, sem valor parcial.
UPDATE faturas
SET status_pagamento = 'pendente', valor_pago = NULL
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07';

SELECT 'depois' AS quando, count(*) AS pagamentos_restantes FROM lancamentos
WHERE anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-07%';

SELECT 'depois' AS quando, status_pagamento, valor_pago FROM faturas
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07';

COMMIT;
