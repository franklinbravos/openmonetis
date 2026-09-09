-- Inter PJ, setembro/2026: R$ 1,23 de lançamento de teste travando a conferência.
--
-- O extrato de 01/09 a 07/09 fecha ao centavo — saldo inicial R$ 0,82, líquido
-- R$ 20.037,90, saldo final R$ 20.038,72 — mas o cadastro projetava
-- R$ 20.036,67, R$ 1,23 a menos.
--
-- A diferença é uma linha só, e ela se identifica sozinha:
--
--   03/09/2026   -R$ 1,23   "Saída - Transf. entre contas"   anotação: "test script"
--
-- Três coisas provam que não é movimento real:
--   1. a anotação diz `test script`;
--   2. o extrato não tem nada em 03/09 — e ele fecha ao centavo, então uma saída
--      real do Inter naquele dia estaria lá;
--   3. tem `transfer_id` mas **nenhuma perna do outro lado** — transferência de
--      uma ponta só não existe.
--
-- Rodar com o ROLLBACK do fim ativo, conferir, e só então trocar por COMMIT.

BEGIN;

SELECT 'antes' AS quando, l.data_compra, l.valor, c.nome AS conta, l.nome,
       l.anotacao, l.transfer_id,
       (SELECT count(*) FROM lancamentos x WHERE x.transfer_id = l.transfer_id) AS pernas
FROM lancamentos l
JOIN contas c ON c.id = l.conta_id
WHERE l.conta_id = '597f2c30-688d-40ef-8ecc-063a90547747'
  AND l.data_compra = '2026-09-03'
  AND l.valor = -1.23
  AND l.anotacao = 'test script';

DELETE FROM lancamentos
WHERE conta_id = '597f2c30-688d-40ef-8ecc-063a90547747'
  AND data_compra = '2026-09-03'
  AND valor = -1.23
  AND anotacao = 'test script'
  AND ofx_fit_id IS NULL;

-- Setembro do Inter, realizados. Com os 8 lançamentos que faltam importar
-- (líquido -R$ 200,00 dos que ainda não entraram), tem de chegar a R$ 20.037,90.
SELECT 'depois: liquido de setembro no Inter' AS quando,
       count(*) AS linhas, round(sum(valor)::numeric, 2) AS liquido
FROM lancamentos
WHERE conta_id = '597f2c30-688d-40ef-8ecc-063a90547747'
  AND periodo = '2026-09' AND realizado;

COMMIT;
