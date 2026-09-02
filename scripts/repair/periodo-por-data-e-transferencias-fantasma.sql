-- Extrato de conta: período por data, e as duas pernas de transferência que o
-- extrato do Nubank não tem.
--
-- CAUSA 1 — período do arquivo carimbado em toda linha.
-- A importação de extrato usava o período do arquivo para todas as linhas, em
-- vez da data de cada uma. O extrato de julho da conta Nubank foi importado com
-- o período de agosto, e 65 lançamentos realizados de julho passaram a contar no
-- mês de agosto: +R$ 2.669,23 que o extrato de agosto não tem.
-- Corrigido no código em `resolveImportRowPeriod`
-- (src/shared/lib/import/period.ts): fatura de cartão tem período, extrato de
-- conta não — cada linha vale pelo mês da sua própria data.
--
-- Só linhas de conta (cartao_id IS NULL) e só realizadas: são as que formam o
-- saldo. As projeções futuras de recorrência ficam como estão, porque mover a
-- primeira ocorrência para o mês da data duplicaria o lançamento real que já
-- veio do extrato.
--
-- CAUSA 2 — par de transferência duplicado.
-- Ao importar o extrato do Inter PJ, o app sintetiza a perna do outro lado sem
-- procurar perna órfã existente. Resultado, duas entradas no Nubank que o
-- extrato de agosto (que fecha ao centavo) não registra:
--
--   01/08  +1.000,00  par a578973e — as DUAS pernas sintéticas, sem id de banco.
--                     Duplica o par real de 31/07 (Inter -1.000 / Nubank +1.000,
--                     ambos com id do banco). Apaga-se o par inteiro.
--   06/08  +  100,00  par 996c6236 — a perna do Inter é real (tem id do banco),
--                     a do Nubank é sintética. Apaga-se só a do Nubank e
--                     desfaz-se o vínculo: o dinheiro saiu do Inter, mas não
--                     entrou no Nubank em agosto.
--
-- Conferência: depois deste reparo o líquido de agosto da conta Nubank passa a
-- ser -R$ 1.206,12, exatamente o que o extrato declara.
--
-- Rodar primeiro com o ROLLBACK do fim ativo, conferir os SELECTs, e só então
-- trocar por COMMIT.

BEGIN;

-- ---------------------------------------------------------------- antes
SELECT 'antes: periodo divergente' AS quando,
       c.nome AS conta, l.periodo, to_char(l.data_compra, 'YYYY-MM') AS mes_data,
       count(*) AS linhas, round(sum(l.valor)::numeric, 2) AS valor
FROM lancamentos l
JOIN contas c ON c.id = l.conta_id
WHERE l.cartao_id IS NULL AND l.realizado
  AND l.periodo <> to_char(l.data_compra, 'YYYY-MM')
GROUP BY 1, 2, 3, 4
ORDER BY 2, 3;

SELECT 'antes: pernas fantasma' AS quando,
       l.data_compra, l.valor, c.nome AS conta, l.nome, l.transfer_id,
       l.ofx_fit_id IS NULL AS sem_id_do_banco
FROM lancamentos l
LEFT JOIN contas c ON c.id = l.conta_id
WHERE l.transfer_id IN (
        'a578973e-bb22-4ba5-8a85-cbbbeabb7805',
        '996c6236-f7dc-41c6-9234-6bed4bfeedd0')
ORDER BY l.transfer_id, l.valor DESC;

-- ---------------------------------------------------------------- causa 1
UPDATE lancamentos
SET periodo = to_char(data_compra, 'YYYY-MM')
WHERE cartao_id IS NULL
  AND realizado
  AND periodo <> to_char(data_compra, 'YYYY-MM');

-- ---------------------------------------------------------------- causa 2
-- Par 100% sintético: some inteiro.
DELETE FROM lancamentos
WHERE transfer_id = 'a578973e-bb22-4ba5-8a85-cbbbeabb7805';

-- Perna do Nubank que o extrato não tem; a do Inter é real e fica, sem par.
DELETE FROM lancamentos
WHERE transfer_id = '996c6236-f7dc-41c6-9234-6bed4bfeedd0'
  AND conta_id = 'c78fec49-d1ae-43ab-af0b-b93fd1ec5371';

UPDATE lancamentos
SET transfer_id = NULL
WHERE transfer_id = '996c6236-f7dc-41c6-9234-6bed4bfeedd0';

-- ---------------------------------------------------------------- depois
SELECT 'depois: periodo divergente (deve vir vazio)' AS quando,
       c.nome AS conta, l.periodo, to_char(l.data_compra, 'YYYY-MM') AS mes_data,
       count(*) AS linhas
FROM lancamentos l
JOIN contas c ON c.id = l.conta_id
WHERE l.cartao_id IS NULL AND l.realizado
  AND l.periodo <> to_char(l.data_compra, 'YYYY-MM')
GROUP BY 1, 2, 3, 4
ORDER BY 2, 3;

-- Agosto da conta Nubank, sem o ajuste de saldo: tem de dar -1206.12.
SELECT 'depois: liquido de agosto no Nubank' AS quando,
       count(*) AS linhas, round(sum(valor)::numeric, 2) AS liquido
FROM lancamentos
WHERE conta_id = 'c78fec49-d1ae-43ab-af0b-b93fd1ec5371'
  AND periodo = '2026-08' AND realizado
  AND nome <> 'Ajuste de saldo';

COMMIT;
