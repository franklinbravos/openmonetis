-- Inter PJ, agosto/2026: R$ 1.890,04 de dinheiro contado duas vezes.
--
-- O extrato do Inter fecha ao centavo — saldo inicial R$ 1.017,81, líquido do
-- mês -R$ 1.016,99, saldo final R$ 0,82 —, mas o cadastro somava -R$ 2.907,03.
-- Comparando o arquivo com o cadastro por (data, valor), a diferença é duplicata
-- exata, em quatro grupos:
--
--   10/08  -1.000,00   arquivo 1 · cadastro 2
--   11/08  -  480,04   arquivo 0 · cadastro 1
--   15/08  -  400,00   arquivo 1 · cadastro 2
--   22/08  -   10,00   arquivo 1 · cadastro 2
--                      -----------
--                      R$ 1.890,04
--
-- CAUSAS
--
-- Transferências (10/08, 15/08, 22/08): cada extrato cria o par inteiro. Ao
-- importar o Nubank, o app sintetizou a perna no Inter; ao importar o Inter, a
-- mesma saída chegou com o nome do banco e não casou com a perna — porque o app
-- tinha substituído a descrição dela por "Saída - Transf. entre contas". O 10/08
-- ainda soma o mesmo lançamento vindo do OFX e do PDF do próprio Inter, com ids
-- de formatos diferentes. Corrigido no código: `isTransferLegSnapshot` faz a
-- perna casar por data e valor, os campos que o banco declara e o app não
-- reescreve.
--
-- Pagamento de fatura (11/08): a baixa da fatura Samsung e a importação do
-- extrato criam cada uma o seu lançamento, e a deduplicação só olha o id do
-- banco — que a baixa não tem. Fica pendente no código.
--
-- CRITÉRIO: em cada grupo (data, valor) sobra uma linha, a de identidade mais
-- forte — id de OFX primeiro, id sintético depois, sem id por último. E o par de
-- transferência que ficar sem o outro lado tem o vínculo desfeito, para não
-- apontar para linha que não existe mais.
--
-- Rodar com o ROLLBACK do fim ativo, conferir, e só então trocar por COMMIT.

BEGIN;

CREATE TEMP TABLE excedentes ON COMMIT DROP AS
SELECT id, data_compra, valor, nome, ofx_fit_id
FROM (
  SELECT l.id, l.data_compra, l.valor, l.nome, l.ofx_fit_id,
         row_number() OVER (
           PARTITION BY l.data_compra, l.valor
           ORDER BY
             CASE
               WHEN l.ofx_fit_id IS NULL THEN 3
               WHEN l.ofx_fit_id LIKE '%|%' THEN 2
               ELSE 1
             END,
             l.id
         ) AS ordem
  FROM lancamentos l
  WHERE l.conta_id = '597f2c30-688d-40ef-8ecc-063a90547747'
    AND l.periodo = '2026-08'
    AND l.realizado
    AND l.nome <> 'Ajuste de saldo'
    AND (l.data_compra, l.valor) IN (
      ('2026-08-10', -1000.00),
      ('2026-08-15', -400.00),
      ('2026-08-22', -10.00)
    )
) ranqueadas
WHERE ordem > 1
UNION ALL
-- Pagamento da fatura Samsung lançado pela baixa; o do extrato fica.
SELECT id, data_compra, valor, nome, ofx_fit_id
FROM lancamentos
WHERE conta_id = '597f2c30-688d-40ef-8ecc-063a90547747'
  AND data_compra = '2026-08-11'
  AND valor = -480.04
  AND ofx_fit_id IS NULL;

SELECT 'a apagar' AS quando, data_compra, valor, nome,
       coalesce(ofx_fit_id, '(sem id)') AS id
FROM excedentes
ORDER BY data_compra, valor;

CREATE TEMP TABLE pares_orfaos ON COMMIT DROP AS
SELECT DISTINCT l.transfer_id
FROM lancamentos l
JOIN excedentes e ON e.id = l.id
WHERE l.transfer_id IS NOT NULL;

DELETE FROM lancamentos WHERE id IN (SELECT id FROM excedentes);

UPDATE lancamentos
SET transfer_id = NULL
WHERE transfer_id IN (SELECT transfer_id FROM pares_orfaos);

-- Agosto do Inter no cadastro, sem o ajuste de saldo. Com as 12 linhas que
-- faltam importar, tem de chegar em -1.016,99.
SELECT 'depois: liquido de agosto no Inter' AS quando,
       count(*) AS linhas, round(sum(valor)::numeric, 2) AS liquido
FROM lancamentos
WHERE conta_id = '597f2c30-688d-40ef-8ecc-063a90547747'
  AND periodo = '2026-08' AND realizado
  AND nome <> 'Ajuste de saldo';

COMMIT;
