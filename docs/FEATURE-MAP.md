# Feature Map

> Auto-maintained index of every user-facing feature and the code path that implements it. Updated alongside the code — not after the fact.

## Autenticação (Login / Cadastro)

Entrar com e-mail/senha ou Google e criar conta. Autenticação real via Supabase Auth, com UI em português.

**Flow:**

1. `src/app/(auth)/login/page.tsx` / `signup/page.tsx` — páginas finas que renderizam os formulários
2. `src/features/auth/components/login-form.tsx` / `signup-form.tsx` — formulários client (validação, estados de erro)
3. `src/app/api/auth/login/route.ts` — endpoint POST que autentica via `supabase.auth.signInWithPassword`
4. `src/shared/lib/supabase/server.ts` / `client.ts` — clientes Supabase (sessão por cookie, listener de auth)
5. `src/shared/lib/auth/server.ts` — `getUser()`/`getUserId()`: sessão deduplicada por request; redirect para `/login`
6. `src/app/(auth)/auth/google/callback/route.ts` — callback OAuth do Google (via `src/shared/lib/auth/google-*`)

Branch (cadastro): `signup-form.tsx` → `src/shared/lib/auth/signup.ts` (também controla `DISABLE_SIGNUP` no `src/proxy.ts`).

---

## Painel (Dashboard)

Visão geral do mês: métricas, widgets editáveis e ações rápidas.

**Flow:**

1. `src/app/(dashboard)/dashboard/page.tsx` — página fina que resolve período e busca dados
2. `src/features/dashboard/page-data-queries.ts` — agrega dashboardData + preferências + opções de quick actions
3. `src/features/dashboard/fetch-dashboard-data.ts` — fetcher central cached (`"use cache"`, tag `dashboard-${userId}`) que dispara as queries por widget em paralelo
4. `src/features/dashboard/lib/` + `overview/` + `bills/` + `invoices/` + `categories/` + `notes/` + `expenses/` etc. — queries de cada widget
5. `src/features/dashboard/components/dashboard-grid-editable.tsx` — grid ordenável de widgets
6. `src/features/dashboard/components/widgets/` — views de cada widget (faturas, contas, contas a pagar, breakdown, etc.)

---

## Lançamentos (Transações)

Listar, filtrar, criar, editar, excluir, pagar, parcelar, antecipar, estornar e exportar lançamentos.

**Flow:**

1. `src/app/(dashboard)/transactions/page.tsx` — resolve período/filtros e busca dados
2. `src/features/transactions/lib/page-helpers.ts` — parse de search params em filtros/paginação (reutilizado por outras features)
3. `src/features/transactions/queries.ts` — `fetchTransactionsPage`/`fetchTransactions` (filtros por userId/adminPayerId/período)
4. `src/features/transactions/components/page/transactions-page.tsx` — página (toolbar de mês, filtros, tabela)
5. `src/features/transactions/components/table/` — tabela, colunas, paginação, actions menu, bulk bar
6. `src/features/transactions/actions.ts` → `actions/*` — Server Actions de mutation; encerram com `revalidateForEntity("transactions", userId)`
7. `src/features/transactions/components/dialogs/transaction-dialog/` — dialog de criação/edição (com anexos, split, parcelas)

---

## Importação de Lançamentos

Importar extratos/arquivos (OFX, CNAB, PDF de fatura, PDF de extrato Mercado Pago/Nubank/Inter, XLS, CSV Inter) e revisar antes de gravar. Na conferência de fatura, a revisão permite editar o valor de cada linha — de linhas do arquivo ainda não importadas e de lançamentos já cadastrados do período — para que o total registrado bata com o total do arquivo.

**Flow:**

1. `src/app/(dashboard)/transactions/import/page.tsx` — página fina que monta o contexto de importação
2. `src/features/transactions/components/import/import-page.tsx` — wizard (upload → review → confirmação)
3. `src/shared/lib/import/parse-import-file.ts` — roteia para o parser correto (ofx-parser, cnab-parser, pdf-parser, xls-parser, inter-csv-parser)
4. `src/features/transactions/actions/import-action.ts` — grava lançamentos e o batch (tabela `importBatches`); `moveImportTransactionToPeriodAction` move lançamento existente para o período reconciliado
5. `src/app/(dashboard)/transactions/import/history/page.tsx` — histórico de batches via `src/features/transactions/queries/import-batch-history.ts`

**Conferência do total da fatura** (fluxo completo em `docs/importacao-fatura-conferencia.md`):

- `src/shared/lib/import/invoice-source-total.ts` — resolve o total do arquivo (`ofx_ledger`, `pdf_header`, `pdf_lines_fallback`, `lines_fallback`)
- `src/shared/lib/import/invoice-total.ts` — `computeImportReconciliation`: total projetado = cadastrado do período + selecionado para importar − duplicatas a remover; delta vs arquivo
- `src/features/transactions/components/import/invoice-total-reconciliation-banner.tsx` — resumo visual da conferência (arquivo, cadastrado, selecionado, projetado, diferença)
- `src/features/transactions/lib/import-invoice-reconciliation.ts` — helpers de período reconciliado e detecção cross-period
- `src/features/transactions/lib/import-amount-edit.ts` — correção de valor por linha (valores cadastrados do período)
- `src/features/transactions/lib/import-invoice-extra-rows.ts` — extras do período ausentes do arquivo (removíveis na confirmação)

**Fechamento (delta = 0):**

1. Usuário revisa a tabela: categoriza, vincula duplicatas, seleciona lançamentos do arquivo e corrige valores de lançamentos cadastrados do período
2. Lançamentos conferidos cujo registro está em **outro período** (cross-period) são destacados com "Outro período" e podem ser movidos para a fatura via "Mover para esta fatura" (`moveImportTransactionToPeriodAction`)
3. `canConfirmImport` exige total projetado = total do arquivo (ou confirmação explícita do override)
4. Ao confirmar, `importTransactionsAction` grava lançamentos, remove duplicatas marcadas e aplica as correções de valor na mesma transação

---

## Cartões

Gerenciar cartões de crédito e defaults de importação de fatura.

**Flow:**

1. `src/app/(dashboard)/cards/page.tsx` — busca `fetchAllCardsForUser`
2. `src/features/cards/queries.ts` — cards ativos/arquivados, contas, período da fatura atual
3. `src/features/cards/components/cards-page.tsx` — lista de cards
4. `src/features/cards/actions.ts` — mutations; `revalidateForEntity("cards", userId)`
5. `src/features/cards/components/card-import-defaults-dialog.tsx` + `actions/import-pdf-password-action.ts` — senha de PDF de fatura

---

## Fatura do Cartão

Acompanhar e pagar a fatura mensal de um cartão, com resumo, status e ajustes.

**Flow:**

1. `src/app/(dashboard)/cards/[cardId]/invoice/page.tsx` — página que resolve período e busca dados da fatura
2. `src/features/invoices/queries.ts` — `fetchInvoiceData`, summaries por mês, transações do cartão
3. `src/features/invoices/components/card-invoice-context-header.tsx` + `invoice-summary-card.tsx` — cabeçalho e resumo
4. `src/features/invoices/components/card-invoice-navigation-shell.tsx` — navegação entre períodos da fatura
5. `src/features/invoices/actions.ts` + `lib/upsert-invoice-payment.ts` — pagar/ajustar fatura (persiste status em `invoices`)
6. `src/features/transactions/components/page/transactions-page.tsx` — seção de lançamentos do período da fatura (reuso)

---

## Contas

Gerenciar contas bancárias, saldo, rendimento, transferências e extrato mensal.

**Flow:**

1. `src/app/(dashboard)/accounts/page.tsx` — busca `fetchAllAccountsForUser`
2. `src/features/accounts/queries.ts` — contas ativas/arquivadas + logos
3. `src/features/accounts/components/accounts-page.tsx` — página de contas
4. `src/features/accounts/actions.ts` — mutations (inclui transfer-dialog, add-yield, adjust-balance); `revalidateForEntity("accounts", userId)`
5. `src/app/(dashboard)/accounts/[accountId]/statement/page.tsx` → `src/features/accounts/statement-queries.ts` — extrato (resumo + transações do mês) renderizado por `AccountStatementCard` + seção de lançamentos

---

## Categorias

Organizar lançamentos por categorias hierárquicas, com ícones, cores e ordenação manual.

**Flow:**

1. `src/app/(dashboard)/categories/page.tsx` — busca `fetchCategoriesForUser`
2. `src/features/categories/queries.ts` — categorias do usuário
3. `src/features/categories/components/categories-page.tsx` — página com `categories-sortable-table.tsx` (drag-and-drop via `lib/category-dnd.ts`)
4. `src/features/categories/actions.ts` — mutations; `revalidateForEntity("categories", userId)`
5. `src/app/(dashboard)/categories/[categoryId]/page.tsx` — detalhe; `src/app/(dashboard)/categories/history/page.tsx` — histórico da categoria

---

## Orçamentos

Definir limites mensais de gasto por categoria e acompanhar consumo.

**Flow:**

1. `src/app/(dashboard)/budgets/page.tsx` — resolve período e busca `fetchBudgetsForUser`
2. `src/features/budgets/queries.ts` — orçamentos + opções de categorias
3. `src/features/budgets/components/budgets-page.tsx` — página com `budget-card.tsx` (limite, gasto, progresso)
4. `src/features/budgets/actions.ts` — mutations; `revalidateForEntity("budgets", userId)`

---

## Pessoas (Pagadores)

Gerenciar pessoas com quem compartilhar finanças e visualizar detalhes por pessoa.

**Flow:**

1. `src/app/(dashboard)/payers/page.tsx` — busca `fetchPayersForUser`
2. `src/features/payers/queries.ts` — pessoas com acesso/roles
3. `src/features/payers/components/payers-page.tsx` — página de pessoas
4. `src/features/payers/actions.ts` + `actions/share-access.ts` — CRUD e compartilhamento (convites, roles); `revalidateForEntity("payers", userId)`
5. `src/app/(dashboard)/payers/[payerId]/page.tsx` → `src/features/payers/lib/detail-queries.ts` + `components/details/` — detalhe (histórico, resumo mensal, uso de cartões, sharing)
6. `src/shared/lib/payers/get-admin-id.ts` — descoberta do pagador admin (usado por queries em toda a app)

---

## Anotações

Criar, editar, arquivar e anexar arquivos a anotações.

**Flow:**

1. `src/app/(dashboard)/notes/page.tsx` — busca `fetchAllNotesForUser`
2. `src/features/notes/queries.ts` — anotações ativas/arquivadas
3. `src/features/notes/components/notes-page.tsx` — página com cards e dialogs
4. `src/features/notes/actions.ts` + `actions/attachments.ts` — mutations e anexos; `revalidateForEntity("notes", userId)`

---

## Calendário

Visualizar transações previstas/pagas em um calendário mensal.

**Flow:**

1. `src/app/(dashboard)/calendar/page.tsx` — resolve período e busca `fetchCalendarData`
2. `src/features/calendar/queries.ts` — eventos do mês (reutiliza filtros de transactions)
3. `src/features/calendar/components/monthly-calendar.tsx` — calendário com grid, day-cell, event-modal e legenda

---

## Insights (IA)

Gerar análises financeiras do período usando provedores de IA configurados.

**Flow:**

1. `src/app/(dashboard)/insights/page.tsx` — busca configuração de IA e período
2. `src/features/insights/actions/aggregate.ts` — agrega dados financeiros do período
3. `src/features/insights/actions/generate.ts` — chama o provedor de IA via `src/shared/lib/ai/` (model-provider)
4. `src/features/insights/actions/storage.ts` + `queries.ts` — salva/lista em `savedInsights`
5. `src/features/insights/components/insights-page.tsx` — página com painel de geração e grid de insights
6. `src/app/api/insights/saved/route.ts` — CRUD de insights salvos via API

---

## Inbox (Pré-lançamentos)

Receber notificações bancárias do app Companion e revisá-las antes de virar lançamento.

**Flow:**

1. `src/app/api/inbox/route.ts` (e `batch/route.ts`) — POST do Companion; autentica Bearer token (`src/shared/lib/auth/api-token.ts`), valida schema (`src/shared/lib/schemas/inbox.ts`), rate limit, grava em `inboxItems`
2. `src/app/(dashboard)/inbox/page.tsx` — resolve status/paginação e busca itens
3. `src/features/inbox/queries.ts` — itens por status, counts, fontes, dados do dialog
4. `src/features/inbox/components/inbox-page.tsx` — abas por status, lista, detalhes, bulk actions
5. `src/features/inbox/actions.ts` — aprovar (cria lançamento via transactions), descartar; `revalidateForEntity("inbox", userId)`

---

## Anexos

Galería de anexos de lançamentos com pré-visualização e estatísticas.

**Flow:**

1. `src/app/(dashboard)/attachments/page.tsx` — resolve período e busca `fetchAttachmentsPageData`
2. `src/features/attachments/queries.ts` — anexos do período
3. `src/features/attachments/components/attachments-page.tsx` — galeria com grid items e preview
4. `src/app/api/attachments/[attachmentId]/presign/route.ts` → `src/shared/lib/storage/presign.ts` — URL assinada de upload/download (S3/Supabase, whitelist MIME em `src/shared/lib/attachments/config.ts`)

Depende de `src/features/transactions` (TransactionDialog, TransactionDetailsDialog, TransactionItem) — intencional.

---

## Relatórios

Análises de tendências de categoria, uso de cartões, estabelecimentos e parcelas.

**Flow (tendências de categoria):**

1. `src/app/(dashboard)/reports/category-trends/page.tsx` — valida intervalo e busca dados
2. `src/features/reports/lib/category-report-queries.ts` + `category-chart-queries.ts` + `category-trends-queries.ts`
3. `src/features/reports/components/category-report-page.tsx` — página com cards, chart, table e export

**Flow (uso de cartões):**

1. `src/app/(dashboard)/reports/card-usage/page.tsx` — busca `fetchCartoesReportData`
2. `src/features/reports/lib/cards-report-queries.ts`
3. `src/features/reports/components/cards/` — overview, breakdown, invoice status, top expenses, chart

**Flow (estabelecimentos):**

1. `src/app/(dashboard)/reports/establishments/page.tsx` — resolve período/filtro
2. `src/features/reports/establishments/queries.ts` — top estabelecimentos
3. `src/features/reports/components/establishments/` — lista, destaques, summary, top categorias

**Flow (análise de parcelas):**

1. `src/app/(dashboard)/reports/installment-analysis/page.tsx`
2. `src/features/dashboard/expenses/installment-analysis-queries.ts` — grupos de parcelas
3. `src/features/dashboard/components/installment-analysis/installment-analysis-page.tsx`

---

## Conciliação

Comparar extratos importados com lançamentos e reconciliar sessões com aliases.

**Flow:**

1. `src/app/(dashboard)/reconciliation/page.tsx` — monta opções de escopo
2. `src/features/reconciliation/components/reconciliation-page.tsx` — página com escopo e pré-visualização
3. `src/features/reconciliation/actions/create-session.ts` / `fetch-session.ts` / `alias-actions.ts` — cria/busca sessão e aliases (tabelas `reconciliationSessions/Lines/Aliases`)
4. `src/features/reconciliation/lib/statement-totals.ts` + `normalize-statement-key.ts` — cálculo de totais e normalização de chaves

---

## Configurações

Gerenciar perfil, preferências, senha, tokens de API, provedores de IA, integração Companion e exclusão de conta.

**Flow:**

1. `src/app/(dashboard)/settings/page.tsx` — busca `fetchSettingsPageData`
2. `src/features/settings/queries.ts` — preferências, tokens, dados de perfil
3. `src/features/settings/components/` — formulários (nome, e-mail, senha, preferências, tokens, AI, delete account, companion, changelog)
4. `src/features/settings/actions.ts` + `actions/ai-providers.ts` — mutations

---

## Changelog

Exibir as notas de versão do app.

**Flow:**

1. `src/app/(dashboard)/changelog/page.tsx` — chama `parseChangelog()`
2. `src/features/settings/lib/parse-changelog.ts` — parse do `CHANGELOG.md` na raiz
3. `src/features/settings/components/changelog-tab.tsx` — renderização das versões
