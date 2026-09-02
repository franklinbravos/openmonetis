-- Mercado Pago, agosto/2026: perna duplicada de −R$ 100,00 em 19/08.
--
-- Conta: a1b19dc8-aebc-4660-8436-7568e55f5643 (Mercado Pago)
-- Reparado em 2026-09-02: apagada 1 de 2 pernas idênticas.
-- O extrato declara uma saída de R$ 100,00 (Pix para o próprio titular). O
-- cadastro tem duas linhas iguais — pernas sintetizadas ao importar o extrato da
-- conta contrária, sem id do banco. A conferência acusa exatamente −R$ 100,00
-- em "lançamentos do mês que não estão no extrato" e o saldo final projetado
-- não fecha.
--
-- CRITÉRIO: sobra uma linha por (data, valor), a de identidade mais forte —
-- id de banco primeiro, id sintético depois, sem id por último. Se a que ficar
-- tiver transfer_id e a outra perna sumir, desfaz-se o vínculo.
--
-- Rodar com o ROLLBACK do fim ativo, conferir os SELECTs, e só então COMMIT.

BEGIN;

CREATE TEMP TABLE conta_mp ON COMMIT DROP AS
SELECT id, nome
FROM contas
WHERE nome ILIKE '%mercado%pago%'
LIMIT 1;

SELECT 'conta alvo' AS quando, id, nome FROM conta_mp;

CREATE TEMP TABLE excedentes ON COMMIT DROP AS
SELECT id, data_compra, valor, nome, ofx_fit_id, transfer_id
FROM (
  SELECT l.id,
         l.data_compra,
         l.valor,
         l.nome,
         l.ofx_fit_id,
         l.transfer_id,
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
  JOIN conta_mp c ON c.id = l.conta_id
  WHERE l.periodo = '2026-08'
    AND l.realizado
    AND l.nome <> 'Ajuste de saldo'
    AND l.data_compra = '2026-08-19'
    AND l.valor = -100.00
) ranqueadas
WHERE ordem > 1;

SELECT 'a apagar' AS quando,
       data_compra,
       valor,
       nome,
       coalesce(ofx_fit_id, '(sem id)') AS id,
       transfer_id
FROM excedentes
ORDER BY data_compra, valor;

CREATE TEMP TABLE pares_orfaos ON COMMIT DROP AS
SELECT DISTINCT e.transfer_id
FROM excedentes e
WHERE e.transfer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lancamentos par
    WHERE par.transfer_id = e.transfer_id
      AND par.id NOT IN (SELECT id FROM excedentes)
  );

SELECT 'pares a desvincular' AS quando, transfer_id FROM pares_orfaos;

DELETE FROM lancamentos WHERE id IN (SELECT id FROM excedentes);

UPDATE lancamentos
SET transfer_id = NULL
WHERE transfer_id IN (SELECT transfer_id FROM pares_orfaos);

-- ---------------------------------------------------------------- depois
SELECT 'depois: 19/08 -100' AS quando,
       l.data_compra,
       l.valor,
       l.nome,
       coalesce(l.ofx_fit_id, '(sem id)') AS id
FROM lancamentos l
JOIN conta_mp c ON c.id = l.conta_id
WHERE l.periodo = '2026-08'
  AND l.realizado
  AND l.data_compra = '2026-08-19'
  AND l.valor = -100.00;

ROLLBACK;
-- COMMIT;
