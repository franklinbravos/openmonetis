-- Junho/2026 Nubank: o pagamento foi R$ 1.715,79, não R$ 7.978,14.
--
-- O resumo da fatura de julho (Nubank_2026-07-12.pdf) declara como a de junho
-- foi liquidada:
--   Fatura anterior            R$ 7.978,15
--   Pagamento recebido        −R$ 1.715,79   (linha "10 JUN Pagamento em 10 JUN")
--   Crédito de parcelamento   −R$ 6.262,36
--                              ───────────
--                              zerada
--
-- Ou seja: pagou R$ 1.715,79 em 10/06 e PARCELOU o resto. Um reparo anterior
-- meu assumiu pagamento integral e gravou R$ 7.978,14 em 12/06, sobrescrevendo
-- o valor correto que já estava registrado.
--
-- Volta o valor e a data que o banco declara. A fatura segue quitada — ela foi
-- liquidada, só que parte por parcelamento.
--
-- Fica de fora, por não ter representação no app: o crédito de parcelamento de
-- R$ 6.262,36, que virou parcelas em faturas seguintes.

BEGIN;

SELECT 'antes' AS quando, l.valor, l.data_compra, l.anotacao
FROM lancamentos l
WHERE l.anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06';

UPDATE lancamentos
SET valor = -1715.79,
    data_compra = DATE '2026-06-10',
    periodo = '2026-06'
WHERE anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06'
  AND valor = -7978.14;

SELECT 'depois' AS quando, l.valor, l.data_compra, l.anotacao
FROM lancamentos l
WHERE l.anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06%'
ORDER BY l.data_compra;

SELECT 'saída da conta em junho' AS o_que, SUM(l.valor) AS total
FROM lancamentos l
WHERE l.anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06%';

COMMIT;
