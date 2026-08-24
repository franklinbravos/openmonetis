-- Julho/2026 Nubank: crédito do estorno de juros e o pagamento que houve.
--
-- Resumo da fatura de julho (Nubank_2026-07-12.pdf):
--   Estorno de juros  −R$ 16,60   e "Total a pagar" R$ 2.109,50
-- O cadastro tinha DUAS cobranças de juros que o banco não cobra —
-- R$ 25,30 e R$ 16,60, ambas de 12/06 — somando os R$ 41,90 que a conferência
-- acusava. O parser do Nubank grava tudo como despesa e não sabe representar
-- crédito, então o estorno nunca entrou.
--
-- Resumo da fatura de agosto (Nubank_2026-08-12.pdf):
--   Fatura anterior R$ 2.109,50 / Pagamento recebido −R$ 2.109,50
--   e na lista: "20 JUL Pagamento em 20 JUL −R$ 2.109,50"
-- Julho foi paga integralmente em 20/07, oito dias após o vencimento — daí os
-- juros e IOF de atraso que entram em agosto.
--
-- Mantém as cobranças no histórico (o banco cobrou) e lança o crédito que as
-- compensa, para o total da fatura ser o que de fato foi pago.

BEGIN;

SELECT 'julho antes' AS quando,
       (SELECT SUM(valor) FROM lancamentos
        WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07') AS total,
       (SELECT status_pagamento FROM faturas
        WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07') AS status;

-- 1. Crédito que compensa os juros estornados (R$ 25,30 + R$ 16,60).
INSERT INTO lancamentos (
  condicao, nome, forma_pagamento, valor, data_compra, tipo_transacao,
  periodo, realizado, user_id, cartao_id, categoria_id, pagador_id
)
SELECT 'À vista', 'Estorno de juros', 'Cartão de crédito', 41.90,
       DATE '2026-06-12', 'Receita', '2026-07', true,
       l.user_id, l.cartao_id,
       (SELECT id FROM categorias WHERE nome = 'Reembolso' AND user_id = l.user_id LIMIT 1),
       l.pagador_id
FROM lancamentos l
WHERE l.cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND l.periodo = '2026-07'
LIMIT 1;

-- 2. Julho foi paga em 20/07, pelo total que o banco declara.
INSERT INTO lancamentos (
  condicao, nome, forma_pagamento, anotacao, valor, data_compra, tipo_transacao,
  periodo, realizado, user_id, conta_id, categoria_id, pagador_id
)
SELECT 'À vista', 'Pagamento fatura - Nubank', 'Pix',
       'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-07',
       -2109.50, DATE '2026-07-20', 'Despesa', '2026-07', true,
       l.user_id, 'c78fec49-d1ae-43ab-af0b-b93fd1ec5371',
       (SELECT id FROM categorias WHERE nome = 'Pagamentos' AND user_id = l.user_id LIMIT 1),
       l.pagador_id
FROM lancamentos l
WHERE l.cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND l.periodo = '2026-07'
LIMIT 1;

UPDATE faturas SET status_pagamento = 'pago', valor_pago = NULL
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07';

-- 3. Agosto: os dois "pagamentos" eram derivados do fantasma de julho e não
--    têm contrapartida no extrato. Some, e agosto volta a em aberto.
DELETE FROM lancamentos
WHERE anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-08%'
  AND ofx_fit_id IS NULL;

UPDATE faturas SET status_pagamento = 'pendente', valor_pago = NULL
WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-08';

SELECT 'julho depois' AS quando,
       (SELECT SUM(valor) FROM lancamentos
        WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07') AS total_fatura,
       (SELECT SUM(valor) FROM lancamentos
        WHERE anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-07%') AS pago,
       (SELECT status_pagamento FROM faturas
        WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-07') AS status;

SELECT 'agosto depois' AS quando,
       (SELECT SUM(valor) FROM lancamentos
        WHERE cartao_id = '23233748-6eed-472f-9ffc-9fde3a5502c9' AND periodo = '2026-08') AS total_fatura,
       (SELECT count(*) FROM lancamentos
        WHERE anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-08%') AS pagamentos;

COMMIT;
