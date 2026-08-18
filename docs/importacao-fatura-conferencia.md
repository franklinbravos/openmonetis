# Importação de Fatura e Conferência do Total

> Como o OpenMonetis importa uma fatura de cartão (OFX/PDF), confere o total registrado contra o total do arquivo e permite fechar a fatura com o delta em zero.

## Visão geral

A importação de fatura passa por um wizard de **upload → revisão → confirmação**. O objetivo da conferência é simples: **os lançamentos cadastrados do período devem somar exatamente o total da fatura** (delta ≤ R$ 0,01). Enquanto isso não acontece, a confirmação fica bloqueada (a menos que o usuário aceite explicitamente o override).

O ponto central é o **período reconciliado**: o mês `YYYY-MM` da fatura em aberto. Só os lançamentos desse período entram na somatória "Já cadastrado".

## Fluxo da conferência

### 1. Total do arquivo

`src/shared/lib/import/invoice-source-total.ts` — `resolveInvoiceSourceTotal(statement)`:

- **OFX**: usa o `LEDGERBAL` da fatura (`ofx_ledger`), com alta confiança.
- **PDF Nubank**: usa o total do cabeçalho da fatura (`pdf_header`), ou a soma das linhas quando o cabeçalho não é confiável (`pdf_lines_fallback`, marcado como "Inferido").
- **Fallback genérico**: soma das linhas do arquivo, excluindo pagamentos de fatura (`lines_fallback`, "Inferido").

Pagamentos de fatura (`Pagamento recebido`) **não** entram no total do arquivo.

### 2. Já cadastrado (período reconciliado)

`src/features/transactions/actions/import-action.ts` — `fetchInvoicePeriodDuplicateSnapshots(cardId, period)` busca as transações com `period = período da fatura`. Essas formam o `invoicePeriodExistingSnapshots`, usado como base do "Já cadastrado".

> Parcelas de cartão costumam ser cadastradas com o período da fatura em que vencem. Se uma parcela foi lançada sob outro período (ex.: no mês da compra), ela **não** entra nesta somatória — ver cross-period abaixo.

### 3. Projeção e delta

`src/shared/lib/import/invoice-total.ts` — `computeImportReconciliation`:

```
projetado = cadastrado do período + selecionado para importar − duplicatas/extras a remover
delta     = projetado − total do arquivo
```

- **Selecionado para importar**: linhas do arquivo marcadas na revisão (não duplicadas/vinculadas).
- **Duplicatas a remover**: linhas do arquivo já cadastradas ("Conferido") e extras do período ausentes do arquivo marcadas para exclusão.

O banner `invoice-total-reconciliation-banner.tsx` mostra: total do arquivo, já cadastrado, selecionado para importar, total projetado e a diferença.

### 4. Revisão da tabela

`src/features/transactions/components/import/import-page.tsx` + `review-table.tsx`:

- **Pendentes**: linhas do arquivo ainda não cadastradas — categorizar, definir pessoa e selecionar.
- **Conferidas** (`isVerifiedImportDuplicate`): batem com lançamento existente do período; valor editável para corrigir arredondamento de parcela.
- **Vinculadas** (`linked`): unidas a lançamento existente via vínculo manual.
- **Divergentes** (`mismatch`): batem por FITID/nome mas com valor diferente — conferir a edição de valor.
- **Extras** (`invoice_extra`): cadastrados do período ausentes do arquivo; marcar para remover se duplicados.

A edição de valor por linha (`src/features/transactions/lib/import-amount-edit.ts`) corrige lançamentos **do período reconciliado**: o valor corrigido entra no cálculo do delta e é persistido na confirmação na mesma transação.

## Cross-period: o problema e a correção

### O problema

O matcher de duplicatas usa candidatos de **todos os períodos** — `fetchCardInstallmentDuplicateSnapshots` inclui parcelas de qualquer mês. Resultado: uma linha do arquivo pode ser marcada como "Conferido" mesmo quando o lançamento existente está cadastrado em **outro período**.

Como o "Já cadastrado" só soma o período reconciliado, essa linha:

- aparece como **conferida/vinculada** (não é selecionável para importar),
- **não** entra no total cadastrado do período,

e o delta fica negativo sem nada selecionável para resolver — o usuário via "R$ 292,19 de diferença" sem saber o que fazer.

### A correção (commits `f7ce832` e `283cec0`)

1. **Detecção** (`src/features/transactions/lib/import-invoice-reconciliation.ts`):
   - `buildInvoicePeriodExistingIdSet(snapshots)` — ids dos lançamentos do período reconciliado.
   - `isImportRowCrossPeriod(row, idSet)` — linha conferida/vinculada cujo `existingTransactionId` está **fora** do período.
   - `collectCrossPeriodReviewStats(rows, idSet)` — contagem e total exibível.

2. **Destaque no banner**: `InvoiceTotalReconciliationBanner` agora mostra "N cadastrados em outro período (R$ X)" na linha de status e explica que a diferença vem desses lançamentos.

3. **Badge na tabela**: linhas cross-period exibem "Outro período" + explicação ("O lançamento existente está cadastrado em outro período e não conta para o total desta fatura").

4. **Ação "Mover para esta fatura"** (`moveImportTransactionToPeriodAction` em `import-action.ts`):
   - Atualiza o `period` do lançamento existente para o período reconciliado.
   - Após o movimento, o lançamento passa a contar no "Já cadastrado", o total projetado fecha e o delta zera — **sem criar duplicata**.
   - Bloqueado para "Pagamento fatura" e "Ajuste de fatura".

## Fechamento da fatura

Para fechar com delta = 0, o usuário pode combinar as ações acima até o banner mostrar "Conferido":

1. Selecionar/importar as linhas do arquivo ainda não cadastradas.
2. Corrigir valores de lançamentos cadastrados do período (arredondamento de parcelas).
3. Mover lançamentos cross-period para o período da fatura.
4. Marcar extras/duplicatas para remoção.

A confirmação (`importTransactionsAction`) executa em uma única transação: grava lançamentos novos, remove duplicatas marcadas e aplica correções de valor. Se o usuário preferir, o checkbox de override permite confirmar mesmo com diferença (útil quando a divergência é intencional).
