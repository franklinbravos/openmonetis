-- Junho/2026 Nubank: R$ 2.500,00 saíram da conta em 18/05 e não estavam lançados.
--
-- O arquivo de junho declara dois pagamentos: R$ 1.000,00 em 12/05 (que fechou
-- maio) e R$ 2.500,00 em 18/05 (que abateu junho). A importação só gravava a
-- liquidação da fatura anterior, então o abate de junho nunca virou lançamento:
-- o extrato mostrava R$ 10.478,14 saindo em 12/06, valor que nunca saiu de uma
-- vez.
--
-- Divide o pagamento único de junho nos dois que de fato aconteceram. A soma
-- continua R$ 10.478,14 — nada é criado nem apagado em termos de dinheiro.

BEGIN;

-- Confere o ponto de partida: uma linha, R$ 10.478,14 em 12/06.
SELECT l.id, l.valor, l.data_compra, l.anotacao
FROM lancamentos l
WHERE l.anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06%';

-- 1. O pagamento do vencimento passa a ser só o que faltava pagar.
UPDATE lancamentos
SET valor = -7978.14
WHERE anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06'
  AND valor = -10478.14;

-- 2. O abate de 18/05 entra como amortização, com a nota que a importação usa.
INSERT INTO lancamentos (
  condicao, nome, forma_pagamento, anotacao, valor, data_compra,
  tipo_transacao, periodo, realizado,
  user_id, conta_id, categoria_id, pagador_id
)
SELECT
  l.condicao,
  l.nome,
  l.forma_pagamento,
  'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06:AMORT:2026-05-18',
  -2500.00,
  DATE '2026-05-18',
  l.tipo_transacao,
  -- Período é o mês em que o dinheiro saiu: o extrato agrupa por período, e no
  -- mês da fatura a saída de maio só apareceria em junho.
  '2026-05',
  true,
  l.user_id,
  l.conta_id,
  l.categoria_id,
  l.pagador_id
FROM lancamentos l
WHERE l.anotacao = 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06';

-- Confere o resultado: duas linhas somando R$ 10.478,14.
SELECT l.valor, l.data_compra, l.anotacao
FROM lancamentos l
WHERE l.anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06%'
ORDER BY l.data_compra;

SELECT SUM(l.valor) AS total_pago_junho
FROM lancamentos l
WHERE l.anotacao LIKE 'AUTO_FATURA:23233748-6eed-472f-9ffc-9fde3a5502c9:2026-06%';

COMMIT;
