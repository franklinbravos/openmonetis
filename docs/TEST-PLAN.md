# Plano de Teste — OpenMonetis

> Documento de referência para a estratégia de teste do OpenMonetis.
> Cobre **todas** as funcionalidades do sistema, organizadas por feature, com níveis de teste, casos mapeados, riscos e rastreabilidade.

**Versão do app sob teste:** 2.8.0
**Stack:** Next.js 16 (App Router) · React 19 · PostgreSQL (Drizzle ORM) · Better Auth · Tailwind 4 · Biome 2.x · pnpm

---

## 1. Objetivo

Garantir que todas as funcionalidades do OpenMonetis funcionem de forma correta, segura e consistente, cobrindo desde operações CRUD até fluxos complexos de finanças (parcelamento, antecipação, importação de extratos, reconciliação, compartilhamento entre pessoas e integração com o app Companion).

## 2. Escopo

### Dentro do escopo

- Todas as 17 features em `src/features/`
- Todas as rotas de página (`src/app/(auth)/`, `src/app/(dashboard)/`, `src/app/(landing-page)/`)
- Todas as rotas de API (`src/app/api/`)
- Fluxos de autenticação e autorização (Better Auth, passkeys, device tokens)
- Integrações externas: S3/MinIO/Supabase Storage, Resend (e-mail), Logo.dev, providers de IA, parsers de importação
- Regras de segurança e multi-tenant por `userId`
- **Migração Supabase 100% API** (seção 5.20): Auth, PostgREST/RPC, RLS, repositories e limpeza de Drizzle/pg/Better Auth — incluindo teste de paridade A/B

### Fora do escopo

- App Android Companion (testado separadamente — apenas o contrato de API é coberto)
- Infraestrutura de deploy (Docker, Coolify, migrações de banco são cobertas por CI manual)
- Landing page multi-domínio além de testes de fumaça

## 3. Estratégia de teste

### 3.1 Níveis

| Nível | Ferramenta sugerida | O que cobre |
|---|---|---|
| **Unitário** | Vitest | Parsers de importação, helpers de moeda/período, lógica de centavos/split, validadores Zod, cálculo de saldos e totais, formatação |
| **Integração** | Vitest + testes de Server Action com DB real | Server Actions (CRUD, séries, antecipações, importação, faturas), queries com relacionamentos, ownership por `userId` |
| **API** | Vitest + fetch com sessão simulada | Rotas `src/app/api/` (health, auth/device, inbox, attachments, insights, logo) |
| **E2E** | Playwright | Fluxos de UI completos: login, CRUD, navegação, widgets do dashboard, importação |
| **Segurança** | Manual + automatizado | Rate limiting, ownership, MIME whitelist, presign, tokens, CSP/headers |

### 3.2 Infraestrutura a criar

O repositório **não possui nenhuma infraestrutura de teste hoje**. Antes da execução:

1. Adicionar `vitest` + `@vitejs/plugin-react` como devDependencies.
2. Adicionar `playwright` + browsers (Chromium/Firefox/WebKit).
3. Criar scripts: `test`, `test:unit`, `test:integration`, `test:e2e`.
4. Criar `vitest.config.ts` e `playwright.config.ts`.
5. Criar helper de setup de DB de teste (schema via `drizzle-kit push` ou migrações) e seed mínimo por teste.
6. Criar helpers de mock: Resend (e-mail), providers de IA, S3/Supabase Storage, Logo.dev.
7. Durante a migração: instância Supabase de teste (branch via CLI) para os testes de RLS/RPC e de paridade A/B.

### 3.3 Dados de teste

- **Seed base por teste (isolado):** 1 usuário admin com payer admin; categorias padrão; 1 conta; 1 cartão.
- **Multiusuário:** 2 usuários com contas e dados distintos para validar isolamento por `userId`.
- **Períodos:** usar `YYYY-MM` fixos e relativos (`getPreviousPeriod`, `addMonthsToPeriod`).
- **Moeda:** `numeric(12,2)`, despesa negativa, receita positiva; usar `splitAmount`/`centsToDecimalString` para validar centavos.

### 3.4 Critérios

- **Entrada:** testes rodando contra DB de teste isolado (nunca o `.env` de produção; usar variável separada, ex. `DATABASE_URL_TEST`).
- **Saída:** 100% de testes das áreas críticas verdes; zero regressões em séries, faturas e saldos.
- **Definição de pronto:** lint (`pnpm run lint`), `tsc --noEmit` e `pnpm exec next typegen` sem erros; testes verdes.

## 4. Priorização e riscos

| Prioridade | Área | Risco de quebra | Motivo |
|---|---|---|---|
| P0 — Crítica | Transactions (séries, splits, antecipação, bulk) | Alto | Núcleo financeiro; geração de múltiplos registros com períodos deslocados |
| P0 — Crítica | Invoices (pagar/reverter fatura) | Alto | Idempotência; settle/unsettle de lançamentos; lançamento "Pagamento fatura" |
| P0 — Crítica | Accounts (saldo inicial, ajuste, rendimento, transferência) | Alto | Criação automática de lançamentos em transação |
| P0 — Crítica | Importação (OFX/CSV/XLS/CNAB/PDF) | Alto | Muitos formatos; dedup por `ofxFitId`; senha de PDF; batches |
| P1 — Alta | Auth (signup, login, passkey, convites, rate limit) | Alto | Porta de entrada; hooks de criação (seed categorias + payer admin) |
| P1 — Alta | Payers (compartilhamento, convites, permissões) | Médio | Multi-tenant parcial; e-mail automático |
| P1 — Alta | Attachments (presign, MIME, limite, órfãos) | Médio | Integração com storage externo |
| P1 — Alta | Inbox + Device tokens (Companion) | Médio | Contrato de API consumido por app externo |
| P2 — Média | Budgets, Categories (hierarquia), Notes, Cards | Médio | Regras de unicidade e proteção de categorias |
| P2 — Média | Reconciliation, Reports, Calendar | Médio | Cálculo de totais e agrupamentos |
| P3 — Baixa | Dashboard widgets, Settings (preferências), Landing, Insights (IA) | Baixo | Config/UI; IA depende de provider externo |

## 5. Mapa de funcionalidades por feature

Cada seção lista as funcionalidades e os casos de teste. Convenção de ID:

- `U` = unitário · `I` = integração · `A` = API · `E` = E2E · `S` = segurança

Formato: `[Feature]-[Nível]-NNN`.

---

### 5.1 Autenticação e Conta — `auth`, `settings`, `(auth)`

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| AUTH-U-001 | Zod: validação de email/senha no signup/login | U | Alta |
| AUTH-I-002 | Signup cria usuário + seed de categorias padrão + payer admin | I | Alta |
| AUTH-I-003 | Signup bloqueado quando `DISABLE_SIGNUP=true`, exceto com convite pendente válido | I | Alta |
| AUTH-I-004 | Login por email/senha cria sessão válida; logout invalida | I | Alta |
| AUTH-I-005 | Google OAuth: account linking e mapeamento de nome | I | Média |
| AUTH-I-006 | Passkey (WebAuthn): registro e autenticação | I | Média |
| AUTH-I-007 | `mustChangePassword` força troca na rota `/change-password-required` | I | Alta |
| AUTH-S-008 | Rate limit: 5 tentativas/min login, 3/min signup (429) | S | Alta |
| AUTH-S-009 | Middleware redireciona não-autenticado → `/login` e autenticado → `/dashboard` | E | Alta |
| AUTH-U-010 | Senha hashada com algoritmo adequado (nunca texto puro) | S | Alta |
| SET-I-011 | `updatePasswordAction` — bloqueado para usuário Google | I | Média |
| SET-I-012 | `updateEmailAction` — valida senha, checa duplicidade, `emailVerified=false` | I | Média |
| SET-I-013 | `completeRequiredPasswordChangeAction` limpa `mustChangePassword` | I | Alta |
| SET-S-014 | `deleteAccountAction` apaga usuário e cascade em todas as tabelas | I | Média |

### 5.2 Transactions (lançamentos) — núcleo

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| TRX-U-001 | `splitAmount` distribui centavos sem perder resto | U | Alta |
| TRX-U-002 | Períodos: `parsePeriod`, `addMonthsToPeriod`, `getPreviousPeriod` (validação `YYYY-MM`) | U | Alta |
| TRX-I-003 | `createTransactionAction` à vista — grava com ownership `userId` | I | Alta |
| TRX-I-004 | Criação parcelada gera série com `seriesId`, períodos deslocados e split correto de centavos | I | Alta |
| TRX-I-005 | Criação recorrente gera N lançamentos com `recurrenceCount` | I | Alta |
| TRX-I-006 | Valida limite do cartão ao criar/editar | I | Alta |
| TRX-I-007 | Bloqueia lançamento em período de fatura já paga | I | Alta |
| TRX-I-008 | Criação com payer secundário e/ou split payers valida permissão e distribui valores | I | Alta |
| TRX-I-009 | `updateTransactionAction` protege saldo inicial e pagamentos automáticos de fatura | I | Alta |
| TRX-I-010 | `updateTransactionAction` sincroniza `initialBalance` da conta (lançamento de saldo inicial) | I | Alta |
| TRX-I-011 | `deleteTransactionAction` remove e limpa anexos órfãos do S3 | I | Alta |
| TRX-I-012 | `toggleTransactionSettlementAction` — cartão bloqueado; boleto grava data/conta; receita vira recebido | I | Alta |
| TRX-I-013 | `convertTransactionToInstallmentAction` — apenas cartão à vista; atualiza registro atual + cria demais | I | Alta |
| TRX-I-014 | `convertTransactionToRecurringAction` | I | Média |
| TRX-I-015 | `updateTransactionSplitPairAction` atualiza irmãos do `splitGroupId` | I | Alta |
| TRX-I-016 | Bulk delete/update com escopos `current\|period\|future\|all` | I | Alta |
| TRX-I-017 | Bulk update recalcula datas/vencimento/período com offset mensal e valida faturas abertas | I | Alta |
| TRX-I-018 | `createMassTransactionsAction` valida ownership | I | Média |
| TRX-I-019 | `deleteMultipleTransactionsAction` | I | Média |
| TRX-I-020 | `refundTransactionAction` — só despesa à vista não-dividida; bloqueia fatura paga e reembolso duplicado | I | Alta |
| TRX-I-021 | Envio de e-mails automáticos a pagadores ao criar/deletar lançamento (mock Resend) | I | Média |
| TRX-U-022 | `fetchTransactionsPage` enriquece transferências com contrapartida | I | Alta |
| TRX-U-023 | Exportação com os filtros da tela (origem `transactions`/`account-statement`) | I | Média |
| TRX-S-024 | Nenhuma query retorna lançamentos de outro `userId` | S | Alta |

#### Antecipação de parcelas

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| ANT-I-001 | `getEligibleInstallmentsAction` — só não-pagas, não-antecipadas e futuras | I | Alta |
| ANT-I-002 | `createInstallmentAnticipationAction` cria lançamento "Antecipação de N parcelas", zera valores, marca `isAnticipated`, registra em `installmentAnticipations` | I | Alta |
| ANT-I-003 | Desconto aplicado corretamente (≤ total); valores em centavos consistentes | I | Alta |
| ANT-I-004 | `cancelInstallmentAnticipationAction` bloqueia se paga; restaura valores e remove registro | I | Alta |
| A-ANT-005 | GET `/api/transactions/installments/[seriesId]/anticipations` retorna histórico da série (com sessão) | A | Média |

### 5.3 Accounts (contas)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| ACC-I-001 | `createAccountAction` — sem saldo inicial, cria só a conta | I | Alta |
| ACC-I-002 | `createAccountAction` com saldo inicial cria lançamento "Saldo inicial - {nome}" na mesma transação (categoria + payer admin exigidos) | I | Alta |
| ACC-I-003 | `updateAccountAction` / `deleteAccountAction` com ownership | I | Alta |
| ACC-I-004 | `transferBetweenAccountsAction` — contas diferentes; cria 2 lançamentos linkados por `transferId` (saída/entrada) | I | Alta |
| ACC-I-005 | `addAccountYieldAction` cria lançamento "Rendimento" (cria categoria se necessário) | I | Média |
| ACC-I-006 | `adjustAccountBalanceAction` — idempotente; remove ajuste se diferença = 0 | I | Alta |
| ACC-I-007 | Saldo = inicial + movimentos realizados (ignora lançamento de saldo inicial; respeita `excludeFromBalance`) | I | Alta |
| ACC-I-008 | `fetchAccountSummary` trata transferências e reembolsos | I | Alta |
| ACC-I-009 | Extrato (`fetchAccountTransactions`) só retorna realizados, filtrando por `userId` | I | Alta |

### 5.4 Invoices (faturas)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| INV-I-001 | `updateInvoicePaymentStatusAction` paga fatura: upsert em `invoices`, settle todos os lançamentos do cartão+período | I | Alta |
| INV-I-002 | Ao pagar, cria lançamento "Pagamento fatura - {cartão}" (Pix, categoria "Pagamentos", parte do admin) | I | Alta |
| INV-I-003 | Reverter pagamento: unsettle lançamentos e apaga o lançamento de pagamento (idempotente por `note`) | I | Alta |
| INV-I-004 | `updatePaymentDateAction` altera data do pagamento | I | Média |
| INV-I-005 | `adjustInvoiceAction` cria lançamento "Ajuste de fatura" idempotente | I | Alta |
| INV-I-006 | `fetchCardInvoiceMonthStatuses` — paga/atrasada por mês usando `dueDay` | I | Média |
| INV-S-007 | Lançamentos de outro usuário nunca são settled por engano (filtro `userId`) | S | Alta |

### 5.5 Cards (cartões)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| CARD-I-001 | CRUD de cartão com ownership e conta ativa obrigatória | I | Alta |
| CARD-I-002 | `fetchAllCardsForUser` — limite em uso, limite disponível, fatura atual e status corretos | I | Alta |
| CARD-I-003 | Senha de PDF de importação: regras `none\|fixed\|cpf_first_6\|cnpj_first_6\|cpf_digits` + segredo criptografado | I | Média |
| CARD-I-004 | `saveCardImportPdfPasswordAction` persiste regra/segredo | I | Média |
| CARD-I-005 | `fetchCardImportPdfPasswordAttemptsAction` gera candidatos por regra | I | Média |
| CARD-U-006 | `resolveImportPdfPassword` aplica cada regra corretamente | U | Alta |

### 5.6 Categories (categorias)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| CAT-U-001 | Hierarquia: `isValidCategoryParent` rejeita ciclos | U | Alta |
| CAT-I-002 | CRUD com ownership; tipo `despesa`/`receita` | I | Alta |
| CAT-I-003 | Categorias protegidas ("Transferência interna", "Saldo inicial", "Pagamentos") não editáveis/removíveis | I | Alta |
| CAT-I-004 | Delete bloqueado quando há subcategorias | I | Alta |
| CAT-I-005 | `reorderCategoriesAction` — valida ids duplicados, tipos, ciclos; reordena em transação | I | Média |

### 5.7 Budgets (orçamentos)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| BUD-I-001 | `createBudgetAction` valida categoria de despesa; unique (userId, categoryId, period) tratando `23505` | I | Alta |
| BUD-I-002 | `updateBudgetAction` / `deleteBudgetAction` | I | Alta |
| BUD-I-003 | `duplicatePreviousMonthBudgetsAction` — idempotente; ignora categorias já orçadas | I | Média |
| BUD-I-004 | `getCategoryBudgetSummaryAction` — gasto × limite excluindo contas excluídas e pagamentos de fatura | I | Alta |
| BUD-I-005 | `fetchBudgetsForUser` computa gasto real por categoria/período | I | Alta |

### 5.8 Payers (pessoas/pagadores)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| PAY-I-001 | `createPayerAction` cria com role `terceiro` e `shareCode` | I | Alta |
| PAY-I-002 | `updatePayerAction` respeita permissão via `getPayerAccess`; admin sincroniza nome do usuário | I | Alta |
| PAY-I-003 | `deletePayerAction` — admin não pode ser removido | I | Alta |
| PAY-I-004 | `joinPayerByShareCodeAction` cria `payerShares` com permission `read` | I | Alta |
| PAY-I-005 | `deletePayerShareAction` — owner ou compartilhado podem remover | I | Média |
| PAY-I-006 | `regeneratePayerShareCodeAction` — novo código, retry em conflito unique | I | Média |
| PAY-I-007 | Convite `magic_link`: token, expiração 7 dias, aceite valida email | I | Alta |
| PAY-I-008 | Convite `credentials`: cria usuário com `mustChangePassword` ou vincula existente | I | Alta |
| PAY-I-009 | `sendPayerSummaryAction` envia e-mail Resend com resumo do período e atualiza `lastMailAt` | I | Média |
| PAY-I-010 | `fetchPayersForUser` — admin primeiro; expõe canEdit/sharedBy/shareCode só se gerencia shares | I | Alta |
| PAY-I-011 | Signup via convite funciona mesmo com `DISABLE_SIGNUP=true` | I | Alta |

### 5.9 Notes (anotações/tarefas)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| NOTE-U-001 | Validações: nota exige descrição; tarefa exige ≥1 tarefa; limites título/descrição | U | Média |
| NOTE-I-002 | CRUD + arquivar/desarquivar com ownership | I | Média |
| NOTE-I-003 | `deleteNoteAction` apaga anexos órfãos do S3 | I | Média |
| NOTE-I-004 | Anexo: presign PUT + token HMAC (10min), valida mime/size/limite do usuário | I | Alta |
| NOTE-I-005 | `confirmNoteAttachmentUploadAction` valida head do S3 e cria registro | I | Alta |
| NOTE-I-006 | `removeNoteAttachmentAction` desvincula e deleta do S3 | I | Média |
| NOTE-I-007 | `fetchAllNotesForUser` retorna ativas + arquivadas com anexos | I | Média |

### 5.10 Attachments (anexos)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| ATT-I-001 | `getPresignedUploadUrlAction` — presign PUT + token HMAC 10min | I | Alta |
| ATT-I-002 | `confirmAttachmentUploadAction` valida metadata e vincula; escopo `period\|future\|all` expande para série | I | Alta |
| ATT-I-003 | `detachAttachmentBulkAction` deleta do S3 quando não há mais referências | I | Média |
| ATT-I-004 | `fetchAttachmentsForPeriod` filtra por período + escopo payer | I | Média |
| ATT-S-005 | `ALLOWED_MIME_TYPES` rejeita arquivos não permitidos | S | Alta |
| ATT-S-006 | Presign de download só para owner (`/api/attachments/[id]/presign` → 401/403 para outro usuário) | A+S | Alta |
| ATT-I-007 | `attachmentMaxSizeMb` do usuário respeitado no upload | I | Alta |
| ATT-I-008 | `cleanupAttachmentsAfterTransactionDelete` remove órfãos | I | Alta |

### 5.11 Inbox + Device tokens (Companion)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| API-I-001 | `createApiTokenAction` gera `opm_...`, guarda hash SHA-256 + prefixo, expira em 1 ano | I | Alta |
| API-I-002 | `revokeApiTokenAction` faz soft delete (`revokedAt`) | I | Alta |
| API-S-003 | GET `/api/auth/device/tokens` exige sessão web; DELETE revoga | A+S | Alta |
| API-S-004 | POST `/api/auth/device/verify` valida Bearer e devolve `{valid, userId, tokenId, tokenName}` | A | Alta |
| API-S-005 | POST `/api/inbox` — token válido; 401 com token revogado/expirado | A+S | Alta |
| API-S-006 | Rate limit: `/api/inbox` 100 req/min, `/api/inbox/batch` 20 req/min | S | Alta |
| API-I-007 | POST `/api/inbox` valida `inboxItemSchema` (Zod) | A | Alta |
| API-I-008 | POST `/api/inbox/batch` — resultado individual por item (`clientId` ↔ `serverId`); falha parcial não quebra lote | A | Alta |
| INB-I-009 | `markInboxAsProcessedAction` — `pending→processed` com `processedAt` | I | Alta |
| INB-I-010 | `discardInboxItemAction` / `restoreDiscardedInboxItemAction` | I | Alta |
| INB-I-011 | `deleteInboxItemAction` só permite não-pendentes; bulk por seleção/status | I | Média |
| INB-I-012 | `fetchInboxItemsPage` — paginação + filtro por app; contadores por status | I | Média |
| INB-I-013 | Fluxo inbox → dialog de transação → `markInboxAsProcessedAction` vincula `transactionId` | I | Alta |

### 5.12 Importação de arquivos

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| IMP-U-001 | `parseImportFile` roteia por extensão (ofx/qfx, xls/xlsx, csv, txt/CNAB, pdf) | U | Alta |
| IMP-U-002 | `parseOfx` — transações, saldo, dedup `ofxFitId` | U | Alta |
| IMP-U-003 | `parseXls` (XLS/XLSX) | U | Alta |
| IMP-U-004 | `parseInterCsv` — colunas do banco Inter | U | Alta |
| IMP-U-005 | `parseCnab` (.txt) | U | Alta |
| IMP-U-006 | `parsePdf` — extração com pdfjs; senha por regra do cartão | U | Alta |
| IMP-U-007 | `source-mime` — whitelist de MIME para upload | U | Alta |
| IMP-I-008 | `importTransactionsAction` com `kind: transaction` | I | Alta |
| IMP-I-009 | `kind: invoice_payment` marca fatura paga | I | Alta |
| IMP-I-010 | `kind: transfer` cria par de lançamentos linkados | I | Alta |
| IMP-I-011 | Parcelamento a partir de fatura e recorrência na importação | I | Alta |
| IMP-I-012 | Dedup `ofxFitId` (unique por usuário); duplicados detectados | I | Alta |
| IMP-I-013 | `linkImportToExistingAction` faz merge preservando note antigo | I | Média |
| IMP-I-014 | `undoImportAction` reverte lote | I | Média |
| IMP-I-015 | Rascunho: `saveImportBatchDraftAction` / `getImportBatchResumeAction` (inline base64 ≤5MB) | I | Média |
| IMP-I-016 | `fetchImportBatchHistoryAction` — histórico com contagens | I | Média |
| IMP-I-017 | Memória de categoria: `fetchImportDescriptionMemory` + `saveCategoryMappings` | I | Média |
| IMP-S-018 | Upload valida MIME e tamanho; presign com token | S | Alta |
| IMP-E-019 | E2E: importar CSV/OFX pela tela `/transactions/import` e ver lançamentos | E | Alta |

### 5.13 Reconciliation (reconciliação de extratos)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| REC-I-001 | `createReconciliationSessionAction` — alvo cartão/conta, modos `card_close`/`account_close`, total do extrato, sessão `draft` + linhas | I | Alta |
| REC-I-002 | `fetchReconciliationSessionAction` carrega sessão + linhas | I | Alta |
| REC-I-003 | `saveReconciliationAliasAction` upsert com `hitCount++` e fonte | I | Média |
| REC-I-004 | `fetchReconciliationAliases` match por chave normalizada | I | Média |
| REC-I-005 | `fetchRecentReconciliationSessions` | I | Média |
| REC-I-006 | Validação de ownership do alvo (cartão/conta de outro usuário → erro) | I | Alta |
| REC-E-007 | E2E: upload de extrato, revisão de linhas e match | E | Média |

> **Nota:** o fluxo de "aplicar sugestões" (colunas `suggestedAction`, `appliedAt`) ainda está parcial no código. Validar `session-preview.tsx` antes de planejar casos além dos acima.

### 5.14 Reports (relatórios)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| REP-I-001 | `fetchCategoryReport` — agrupamento por categoria/período | I | Alta |
| REP-I-002 | `fetchCartoesReportData` — resumo, uso mensal, breakdown por categoria, top despesas, status de fatura | I | Alta |
| REP-I-003 | `fetchCategoryChartData` — dados de tendência | I | Média |
| REP-I-004 | `fetchTopEstablishmentsData` — destaques e top categorias | I | Média |
| REP-I-005 | Exportação do relatório de categoria (arquivo gerado) | I | Média |
| REP-U-006 | Cálculo de totais e percentuais com centavos consistentes | U | Alta |

### 5.15 Calendar (calendário)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| CAL-I-001 | `fetchCalendarData` — lançamentos por `purchaseDate` no mês | I | Alta |
| CAL-I-002 | Boletos por `dueDate` | I | Alta |
| CAL-I-003 | Lançamentos de cartão do período → evento de vencimento no `dueDay` (status pago/pendente via lançamento "Pagamento fatura") | I | Alta |
| CAL-I-004 | Parcelas agrupadas em evento único de instalação (`seriesId` ≥2 no mês) | I | Alta |
| CAL-I-005 | Exclui transferências e pagamentos de fatura como eventos separados | I | Alta |

### 5.16 Dashboard

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| DSH-I-001 | `fetchDashboardPageData` consolida métricas, saldos, faturas, bills, metas, pessoas, inbox | I | Alta |
| DSH-I-002 | Cache: `use cache` com `cacheTag('dashboard-${userId}')`; mutação revalida via `revalidateForEntity` | I | Alta |
| DSH-I-003 | `updateWidgetPreferences` / `resetWidgetPreferences` persistem em `dashboardWidgets` | I | Média |
| DSH-I-004 | Notificações: marcar lida/não-lida/arquivar/desarquivar (com fallback se tabela ausente) | I | Média |
| DSH-E-005 | E2E: widgets aparecem, action dialogs (pagar boleto/fatura) funcionam | E | Média |
| DSH-I-006 | Filtro por pessoa (payer) afeta todos os widgets financeiros | I | Alta |

### 5.17 Insights (IA)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| INS-U-001 | `aggregateMonthData` — totais, tendência 3 meses, orçamentos, ticket médio, gastos por dia da semana | U | Alta |
| INS-U-002 | Despesas recorrentes (nome igual ≥2 meses, variação ≤20%) | U | Alta |
| INS-U-003 | Comprometimento futuro de parcelas | U | Média |
| INS-I-004 | `generateInsightsAction` chama LLM via `generateObject`, valida schema, persiste | I | Média |
| INS-I-005 | `saveInsightsAction` / `deleteSavedInsightsAction` — upsert por userId+period | I | Média |
| INS-I-006 | `fetchSavedInsights` valida period `YYYY-MM` | I | Média |
| INS-A-007 | GET `/api/insights/saved?period=YYYY-MM` — sessão + formato válido | A | Média |
| INS-I-008 | `updateAiProviderSettingsAction` criptografa API keys; `fetchAiProviderSettingsAction` retorna config | I | Média |

### 5.18 API base e infra

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| API-000 | GET `/api/health` → 200 e `SELECT 1`; 503 com DB indisponível | A | Alta |
| LOG-A-001 | GET `/api/logo/search?q=` — sessão exigida; até 20 resultados | A | Média |
| LOG-A-002 | GET `/api/logo/mapping?name=` — sessão opcional; domínio/logoUrl | A | Média |
| ATT-A-001 | GET `/api/transactions/[transactionId]/attachments` — sessão + ownership | A+S | Alta |

### 5.19 Settings (configurações)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SET-P-001 | `updatePreferencesAction` — nota como coluna, ordem de colunas, limite anexo 1–100MB, resumo, agrupamento, ocultar antecipadas | I | Média |
| SET-P-002 | `updateNameAction` sincroniza nome do payer admin | I | Média |
| SET-P-003 | `resetAccountAction` zera dados (shares, preferências, tokens, insights, notas, inbox, orçamentos, antecipações, lançamentos, anexos, faturas, cartões, contas, pessoas, categorias) e recria categorias + payer admin | I | Alta |
| SET-P-004 | `fetchSettingsPageData` retorna provider de auth, preferências, tokens, config IA | I | Média |

### 5.20 Migração para Supabase 100% API

> **Contexto da migração:** o OpenMonetis está migrando de Drizzle ORM + `pg` (Postgres direto) + Better Auth para um modelo 100% Supabase Cloud: **Supabase Auth** (sessão), **PostgREST** via `@supabase/supabase-js`/`@supabase/ssr`, **Storage API** e **funções SQL expostas como RPC** — removendo `DATABASE_URL`, `pg` e transaction pooler do runtime. Hoje ~90 arquivos importam `src/shared/lib/db.ts` (Drizzle), Better Auth usa `drizzleAdapter`, e 7 fluxos usam `db.transaction()` (importação, faturas, contas, bulk) que precisam virar RPCs atômicas.
>
> **Arquitetura alvo:** `@supabase/ssr` (sessão do usuário) + client `service_role` (rotas server-only) → Auth API, PostgREST, RPCs SQL/Views, Storage. **Variáveis de runtime (somente):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`. **Removidos:** `DATABASE_URL`, `SUPABASE_TRANSACTION_POOLER`, `BETTER_AUTH_*`, dependências `pg` e uso runtime de `drizzle-orm`.
>
> **Objetivo transversal dos testes:** **paridade de comportamento** entre o modelo atual (Drizzle+pg+Better Auth) e o destino (Supabase Auth + PostgREST/RPC + RLS), com zero mudança no contrato HTTP das rotas consumidas pelo Companion (`/api/health`, `/api/inbox*`).
>
> **Fases da migração cobertas abaixo:** (1) Fundação — migrations SQL, RLS, clients SSR/admin e tipos; (2) Autenticação — Supabase Auth; (3) Camada de dados — repositories substituindo `db.ts`; (4) RPCs SQL para queries complexas e transações atômicas; (5) Migração por domínio — payers → categories/accounts/cards → transactions → demais; (6) Limpeza e deploy — remover pg/drizzle/Better Auth e migrar dados existentes.

#### Estratégia de teste da migração

- **Teste de paridade (A/B):** para cada query complexa migrada, executar a mesma consulta com dados idênticos no banco atual e no Supabase e comparar resultados (totais, splits, agrupamentos). Rodar durante as Fases 3–5 da migração.
- **RLS como oráculo de segurança:** após a Fase 1, testar que um client com sessão de outro usuário recebe vazio/erro em toda tabela de domínio — substitui parte dos testes de ownership por `userId`.
- **Contrato Companion imutável:** `/api/health` e `/api/inbox*` devem manter payload e status codes idênticos antes/depois (testes de API já existentes na seção 5.11 continuam válidos sem alteração).
- **Ambiente:** instância Supabase de teste por CI (branch via CLI) + banco Postgres local apenas durante a transição para os testes A/B.
- **Ordem de migração por domínio:** payers + preferences (base de `getAdminPayerId`) → categories/accounts/cards → transactions (maior volume) → invoices/budgets/notes/calendar/inbox → dashboard widgets (RPCs) → reports/reconciliation/attachments/import → settings/health check.

#### Casos de teste por fase

**Fase 1 — Fundação (migrations SQL, RLS, clients, tipos)**

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SUP-BASE-001 | `supabase gen types typescript` gera tipos em sincronia com as migrations (sem drift `--verify`) | U | Alta |
| SUP-BASE-002 | Nomes de tabelas/colunas preservados (`contas`, `preferencias_usuario`, etc.) — nenhuma quebra de mapeamento de UI | I | Alta |
| SUP-RLS-003 | RLS habilitado em **todas** as tabelas de domínio; client anônimo recebe vazio em todas | S | Alta |
| SUP-RLS-004 | Política `auth.uid() = user_id` permite leitura apenas dos próprios registros (amostragem por tabela) | S | Alta |
| SUP-RLS-005 | Políticas de compartilhamento de payers replicam `src/shared/lib/payers/access.ts` (leitura do compartilhado) | S | Alta |
| SUP-RLS-006 | `service_role` (admin server-only) ignora RLS para rotas Companion e jobs | S | Alta |
| SUP-BASE-007 | `createServerClient` / `createClient` / admin unificado funcionam com as envs Supabase-only | I | Alta |
| SUP-BASE-008 | `.env.example` e README documentam apenas `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `STORAGE_BUCKET` | U | Média |

**Fase 2 — Autenticação (Supabase Auth)**

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SUP-AUTH-001 | Login email/senha via `signInWithPassword` cria sessão SSR; logout invalida | I | Alta |
| SUP-AUTH-002 | Signup cria usuário + seeds pós-signup (categorias padrão + payer admin) via trigger `auth.users` ou hook de primeiro login | I | Alta |
| SUP-AUTH-003 | Google OAuth com callback `/auth/callback` e criação/vinculação de usuário | I | Alta |
| SUP-AUTH-004 | `mustChangePassword` sobrevive via `raw_user_meta_data` ou `user_profiles` e continua forçando `/change-password-required` | I | Alta |
| SUP-AUTH-005 | `getUser()` (SSR) retorna usuário válido; não-autenticado redireciona para `/login` | I | Alta |
| SUP-AUTH-006 | Rate limits preservados (5/min login, 3/min signup) — via Supabase Auth settings | S | Alta |
| SUP-AUTH-007 | Passkeys v1 removidos sem vazar estado (remover UI e schema `passkey`) | I | Média |
| SUP-AUTH-008 | Tokens Companion `opm_*` validados via admin/REST (mesma lógica de hoje, sem Better Auth) | S | Alta |
| SUP-AUTH-009 | `DISABLE_SIGNUP` mantém fluxo de convite (signup liberado com convite pendente válido) | I | Alta |

**Fase 3 — Camada de dados (repositories)**

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SUP-REPO-001 | `src/shared/lib/db.ts` não exporta mais `Pool`/`drizzle` no runtime (import falha em build) | I | Alta |
| SUP-REPO-002 | Server Actions usam client com sessão + RLS; filtro `userId` mantido onde a regra de negócio exige `adminPayerId` | I | Alta |
| SUP-REPO-003 | Rotas Companion usam admin client com `.eq("user_id", tokenUserId)` | A | Alta |
| SUP-REPO-004 | Erros Supabase mapeados para "Algo deu errado" (sem vazar detalhe) | I | Alta |
| SUP-REPO-005 | Paridade: `fetchTransactionsPage`, `fetchDashboardPageData`, `fetchCategoryReport`, `aggregateMonthData` retornam os mesmos resultados antes/depois | I | Alta |

**Fase 4 — RPCs SQL (queries complexas + transações atômicas)**

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SUP-RPC-001 | View/RPC `transactions_with_relations` paginada equivale à query Drizzle atual (mesmos filtros/ordenação) | I | Alta |
| SUP-RPC-002 | RPC `aggregate_month_data(user_id, period)` produz totais idênticos ao `aggregateMonthData` atual (incl. tendência 3 meses, ticket médio, recorrentes) | I | Alta |
| SUP-RPC-003 | RPCs de reports/statement/invoice respeitam filtros de período e `settledOnly` | I | Alta |
| SUP-RPC-004 | RPCs atômicas (`SECURITY DEFINER`, `BEGIN…COMMIT`) cobrem os 7 fluxos de `db.transaction()`: importação, faturas, contas, bulk, antecipação, transferência, ajuste | I | Alta |
| SUP-RPC-005 | RPC atômica falha completa em caso de erro (rollback) — sem estado parcial | I | Alta |
| SUP-RPC-006 | RPC valida ownership: `SECURITY DEFINER` recebe `user_id` explícito e nunca retorna dados de outro usuário | S | Alta |
| SUP-RPC-007 | Imports não usam mais `pg` no runtime (verificação de bundle/build) | I | Média |

**Fase 5 — Migração por domínio (payers → categories/accounts/cards → transactions → demais)**

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SUP-DOM-001 | A cada bloco migrado, `pnpm exec tsc --noEmit` + lint + testes da seção correspondente verdes | I | Alta |
| SUP-DOM-002 | Payers + preferences: `getAdminPayerId`, compartilhamento e convites funcionam via Supabase | I | Alta |
| SUP-DOM-003 | Categories/accounts/cards: CRUD e saldos via repositories | I | Alta |
| SUP-DOM-004 | Transactions: séries, splits, antecipações, bulk e importação (maior volume) via RPC/repositories | I | Alta |
| SUP-DOM-005 | Invoices/budgets/notes/calendar/inbox: settle de fatura e idempotência preservados | I | Alta |
| SUP-DOM-006 | Dashboard widgets consomem RPCs sem quebrar a consolidação | I | Alta |
| SUP-DOM-007 | Reports/reconciliation/attachments/import funcionam via API | I | Média |
| SUP-DOM-008 | Settings e health check: `/api/health` passa a checar Supabase (`select id limit 1` ou ping Auth) com 200/503 | A | Alta |
| SUP-DOM-009 | **Paridade de saldos:** após migração, saldos de contas, faturas e limites de cartão batem com o estado anterior | I | Alta |

**Fase 6 — Limpeza e deploy**

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SUP-CLEAN-001 | `pg`, `drizzle-orm` (runtime), `better-auth`, `@better-auth/passkey` removidos do `package.json` e ausentes do bundle | I | Alta |
| SUP-CLEAN-002 | `drizzle.config.ts`, `migration-env.ts` e serviço `db` do docker-compose removidos; Docker fica só `app` | U | Média |
| SUP-CLEAN-003 | `predev` trocado por `supabase db push`; `setup.mjs`, CI e `scripts/migrate-to-supabase.sh` atualizados | U | Média |
| SUP-DATA-004 | Migração de dados existentes: script one-shot cria usuários no Supabase Auth (reset de senha por e-mail) e preserva `user.id` nas tabelas de domínio | I | Alta |
| SUP-DATA-005 | Pós-migração de dados: total de registros por tabela de domínio bate com o pré-migração (contagem A/B) | I | Alta |
| SUP-DATA-006 | Relacionamentos preservados (FKs `user_id`, `series_id`, `split_group_id`, `transfer_id`) após migração | I | Alta |
| SUP-E2E-007 | E2E final em ambiente Supabase-only: signup, login, CRUD completo, pagamento de fatura, importação, download de anexo | E | Alta |

## 6. Testes de segurança (cross-feature)

| ID | Caso de teste | Nível | Prioridade |
|---|---|---|---|
| SEC-U-001 | Toda query de leitura filtra por `userId` (amostragem por feature) | S | Alta |
| SEC-U-002 | `getAdminPayerId` usado para descobrir admin (sem JOIN com payers) | S | Alta |
| SEC-I-003 | IDOR: recurso de outro usuário (conta, cartão, lançamento, anexo, token, sessão de reconciliação) → 404/403 | S | Alta |
| SEC-S-004 | CSP e headers de segurança presentes (`src/proxy.ts`, `next.config.ts`) | S | Alta |
| SEC-U-005 | Input validado com Zod em todas as actions e rotas de API | S | Alta |
| SEC-U-006 | Presign/token HMAC expiram; MIME whitelist; limites de tamanho | S | Alta |
| SEC-U-007 | Erros não expõem stack traces/paths; mensagem genérica "Algo deu errado" | S | Alta |
| SEC-U-008 | Secrets nunca no client (sem `NEXT_PUBLIC_` sensível; keys server-side) | S | Alta |

## 7. Testes de navegação E2E (Playwright)

> Fluxo contínuo para garantir a usabilidade e consistência do frontend. Para **cada falha** encontrada, um agente corrige, um reviewer valida o código, o caso é documentado abaixo e o teste é reexecutado — em loop até estabilizar.

### 7.1 Metodologia do loop

1. Rodar a suíte `tests/e2e/` (Playwright, Chromium).
2. Para cada teste que falhar: liberar agente de correção → agente de review (coerência/qualidade/segurança) → registrar o caso na seção 7.3 → reexecutar.
3. Coletar e analisar: `console.error` do browser, `pageerror`, `requestfailed` e logs do terminal (`pnpm run dev`).
4. Considerar "estável" quando a suíte inteira passar sem erros de console/servidor nas áreas testadas.

### 7.2 Roteiro de navegação coberto

| ID | Fluxo E2E | Seletores/verificações principais | Status |
|---|---|---|---|
| E2E-NAV-001 | Login email/senha → dashboard renderiza widgets | `#email`, `#password`, botão "Entrar", URL `/dashboard`, sem "Algo deu errado" | ✅ |
| E2E-NAV-002 | Dashboard → Lançamentos (navegação por menu) | Menu "Lançamentos", heading "Lançamentos" | ✅ |
| E2E-NAV-003 | Lançamentos: criar despesa, ver na tabela, apagar + validar DB | Botão "Nova Despesa", dialog, `#name`, `#purchaseDate`, `#amount`, `#categoria`, `#paymentMethod`, `#conta`, salvar, menu "Remover", 0 órfãos no banco | ✅ |
| E2E-NAV-004 | Contas: listar e abrir extrato | Menu "Finanças" → "Contas", card de conta, extrato | ✅ |
| E2E-NAV-005 | Cartões: listar e abrir fatura | Menu "Cartões", card, fatura do período | ✅ |
| E2E-NAV-006 | Categorias: listar e abrir histórico | Menu "Categorias", tabela, detalhe, histórico | ✅ |
| E2E-NAV-007 | Orçamentos: listar/criar | Menu "Orçamentos", dialog de orçamento | ✅ |
| E2E-NAV-008 | Pessoas: listar e detalhe | Menu "Pessoas", card, detalhe da pessoa | ✅ |
| E2E-NAV-009 | Anotações: listar/criar/arquivar | Menu "Anotações", dialog | ✅ |
| E2E-NAV-010 | Calendário: renderiza eventos do mês | Menu "Calendário", grade | ✅ |
| E2E-NAV-011 | Insights: painel abre | Menu "Insights", painel de geração | ✅ |
| E2E-NAV-012 | Inbox: lista pré-lançamentos | Menu "Inbox", itens/empty state | ✅ |
| E2E-NAV-013 | Relatórios (4): abrem sem erro | "Tendências", "Uso de cartões", "Análise de parcelas", "Estabelecimentos" | ✅ |
| E2E-NAV-014 | Configurações: abas renderizam | Menu "Ajustes", abas (perfil, preferências, segurança, API tokens, IA) | ✅ |
| E2E-NAV-015 | Anexos por período | Menu "Anexos" | ✅ |
| E2E-NAV-016 | Logout | Menu do usuário → Sair → URL `/login` | ✅ |
| E2E-NAV-017 | Importação: tela + histórico | `/transactions/import` e `/transactions/import/history` | ✅ |
| E2E-NAV-018 | Reconciliação: tela abre | Menu "Reconciliação" | ✅ |

### 7.3 Falhas encontradas e correções (registro do loop)

| Falha | Causa raiz | Correção aplicada | Verificação |
|---|---|---|---|
| 22007 `invalid input syntax for type date` no dashboard/transactions | Filtros `Date` serializados como `String()` pelo supabase-js em colunas date/timestamp | `serializeFilterValue()` no bridge (`applyFilters`/`formatOrValue`) converte `Date → toISOString()` | `/transactions` e `/dashboard` carregam |
| Dashboard "Algo deu errado" após login | Query `fetchAttachmentsForPeriod` usava junction joins (`lancamento_anexos → lancamentos → pagadores/categorias`) não resolvidos pelo bridge | Reescrita com admin Supabase + select PostgREST aninhado + ordenação em JS | Dashboard renderiza widgets |
| Popover de categoria não clicável dentro do dialog | Dialog modal aplica `pointer-events: none` no body; `PopoverContent` (portal) herdava | `pointer-events-auto` + `data-[state=open]:pointer-events-auto` no `PopoverContent` | Seleção de categoria via clique funciona |
| Tabela de lançamentos com dados vazios | `fromDbRow` propagava chaves extras (relações aninhadas) dentro do objeto da tabela | `fromDbRow` agora retorna apenas colunas da tabela | Linhas da tabela preenchem nome/valor/pessoa |
| `/payers` "Algo deu errado" (PGRST201) | `payerShares → payers → user` com 2 FKs para `user` gerava embed ambíguo no PostgREST | `fetchSharedSharesForUser` reescrita com admin Supabase + embed aninhado `pagadores!pagador_id(*, user:user!user_id(...))` | `/payers` renderiza |
| `/payers` crash `createdAt?.toISOString is not a function` | PostgREST devolve `created_at` como string ISO, não `Date` | `toIsoString()` em `payers/queries.ts` normaliza Date\|string | `/payers` renderiza |
| `/settings` timeout (sem `<main>`) | Página não renderizava `<main>` (única exceção nas 16 rotas) | Envolto em `<main className="flex flex-col gap-6">` | `/settings` renderiza |
| Logout não retornava a `/login` | Seletor do teste não casava com `aria-label="Menu do usuário"` real | Seletor `getByRole("button", { name: /menu do usuário/i })` + `expect URL /login` | Logout funciona |
| Delete/insert não persistiam (lançamentos ficavam órfãos) | Builders `db.delete()`/`db.insert()` do bridge não eram thenable — `await db.delete().where()` não executava | `createDeleteBuilder`/`createInsertBuilder` agora expõem `then()` (thenable) além de `execute()`/`returning()` | Lançamento de teste some do banco; zero órfãos após o E2E |
| `column anotacao_anexos.created_at does not exist` (42703) | `orderBy` do bridge aplicava `.order()` em coluna de tabela relacionada (`attachments.createdAt`) na tabela junction | `orderBy` no `executeFlat` só aplica no PostgREST para colunas da tabela principal; demais ordenam em JS | Anexos/notas renderizam |
| Relações `with`/joins retornavam `undefined` | PostgREST devolve relações com nome da tabela (`pagadores`), código lia chave Drizzle (`payer`) | `runFind`/`mapSelectRow` leem `row[relation] ?? row[tableName]` | Nomes de pessoa/conta/cartão/categoria preenchidos |
| `/reconciliation`: "Maximum update depth exceeded" (loop infinito) | `UploadZone`/`ImportPage` usavam default `= []` para prop opcional de array — nova referência a cada render alimentava `useEffect` de sincronização | Constantes de módulo estáveis (`EMPTY_AUTO_PDF_PASSWORD_ATTEMPTS`, `EMPTY_INITIAL_IMPORT_HISTORY`) para os defaults | `/reconciliation` renderiza sem erros de console |
| Lançamentos de teste órfãos no banco | Execuções E2E interrompidas deixavam `E2E Teste %` no banco | `beforeEach` limpa órfãos via Supabase admin + assertion final confere 0 registros | Banco limpo após cada execução |
| `console.error` de HTML inválido (button aninhado no PayerTag) | `<button>` dentro de `<button>` no componente PayerTagsSelect | Pré-existente — documentado; filtrado no collector de erros do E2E | Teste ignora warning específico |

## 8. Testes de regressão

Conjunto mínimo a executar a cada release (CI):

1. CRUD de lançamento em cada condição (à vista/parcelado/recorrente) e verificação de saldos.
2. Pagar e reverter fatura — validar settle/unsettle e lançamento de pagamento idempotente.
3. Antecipação de parcelas criar/cancelar — valores restaurados.
4. Transferência entre contas — par de lançamentos com saldos corretos.
5. Importação de arquivo de exemplo (OFX + CSV Inter) e dedup.
6. Signup/login com sessão; convite de pessoa com `DISABLE_SIGNUP=true`.
7. Dashboard: soma de receitas/despesas/saldo do período.
8. Exportação de dados com filtros.

**Durante a migração Supabase** (até a Fase 6 concluir), adicionar:

9. Testes de paridade A/B nas áreas afetadas pelo PR (mesmos dados → mesmos resultados).
10. Suíte de RLS: client com sessão de outro usuário recebe vazio em toda tabela de domínio.
11. Contrato Companion: payload/status de `/api/health` e `/api/inbox*` inalterados.
12. Contagem de registros por tabela de domínio antes/depois da migração de dados.

## 9. Rastreabilidade e execução

| Fase | Atividade | Responsável |
|---|---|---|
| 1 | Instalar infraestrutura (Vitest + Playwright + scripts) | Dev |
| 2 | Testes unitários (U) — parsers, helpers, validadores | Dev |
| 3 | Testes de integração (I) — Server Actions com DB de teste | Dev |
| 4 | Testes de API (A) e segurança (S) | Dev |
| 5 | Testes E2E (E) — Playwright | Dev |
| 6 | Revisão do plano frente a mudanças (atualizar este arquivo) | Dev |

**Durante a migração Supabase** (por PR de cada fase, na ordem: Fundação → Auth → repositories → RPCs → domínios → limpeza):

| Fase | Atividade | Responsável |
|---|---|---|
| M1 | Testes de RLS (SUP-RLS-*) e tipos (SUP-BASE-*) | Dev |
| M2 | Testes de auth Supabase (SUP-AUTH-*) | Dev |
| M3 | Paridade das queries migradas (SUP-REPO-005) | Dev |
| M4 | Testes de RPCs e atomicidade (SUP-RPC-*) | Dev |
| M5 | Por bloco migrado: regressão da feature + paridade de saldos (SUP-DOM-*) | Dev |
| M6 | Limpeza (SUP-CLEAN-*) + migração de dados (SUP-DATA-*) + E2E Supabase-only | Dev |

### Checklist de verificação antes de fechar uma mudança

- [ ] `pnpm exec next typegen` sem erros
- [ ] `pnpm exec tsc --noEmit` sem erros
- [ ] `pnpm run lint` sem erros
- [ ] Testes das áreas afetadas verdes (unit/integration/API/E2E)
- [ ] `docs/TEST-PLAN.md` atualizado se o escopo mudou

## 10. Pendências conhecidas

- Fluxo de "aplicar sugestões" na reconciliação (`suggestedAction`/`appliedAt`) — confirmar implementação em `session-preview.tsx`.
- Testes de IA dependem de provider externo — usar mock do provider para determinismo.
- E-mails (Resend) — sempre mocado; validar contrato do HTML por snapshot.
- Migração Supabase: passkeys v1 serão removidos (sem substituição na v1); definir teste de contrato Companion para `supabase.auth` antes de remover Better Auth.
- Paridade A/B exige manter banco Postgres local durante a transição — remover da infra assim que a Fase 6 concluir.
