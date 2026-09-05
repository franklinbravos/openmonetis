"use client";

import { RiSaveLine } from "@remixicon/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import {
	type CreatedAccount,
} from "@/features/accounts/components/create-account-inline-dialog";
import { isAccountStatementMovementImportRow } from "@/features/accounts/lib/statement-balance-reconciliation";
import {
	type CreatedCategory,
} from "@/features/categories/components/create-category-inline-dialog";
import type { Category } from "@/features/categories/components/types";
import type { CardLimitsSnapshot } from "@/features/transactions/actions/card-limits";
import type { TransactionDialogOptions } from "@/features/transactions/actions/fetch-dialog-options";
import type { InvoiceSnapshot } from "@/features/transactions/actions/previous-invoice-snapshot";
import {
	analyzeImportAiBatchClient as analyzeImportAiBatchAction,
	checkDuplicateFitIdsClient as checkDuplicateFitIds,
	deleteImportBatchClient,
	deleteImportDuplicateTransactionClient as deleteImportDuplicateTransaction,
	deleteTransactionByFitIdClient as deleteTransactionByFitId,
	fetchAccountImportDuplicateSnapshotsClient as fetchAccountImportDuplicateSnapshots,
	fetchCardInstallmentDuplicateSnapshotsClient as fetchCardInstallmentDuplicateSnapshots,
	fetchCardLimitsClient as fetchCardLimitsAction,
	fetchImportBatchHistoryClient as fetchImportBatchHistoryAction,
	fetchImportDescriptionMemoryClient as fetchImportDescriptionMemory,
	fetchImportDuplicateSnapshotsClient as fetchImportDuplicateSnapshots,
	fetchInvoicePeriodDuplicateSnapshotsClient as fetchInvoicePeriodDuplicateSnapshots,
	fetchInvoiceSnapshotClient as fetchInvoiceSnapshotAction,
	getImportBatchDraftClient as getImportBatchDraftAction,
	getImportBatchResumeClient as getImportBatchResumeAction,
	importTransactionsClient as importTransactionsAction,
	linkImportSuggestionsBatchClient as linkImportSuggestionsBatchAction,
	matchInvoicePaymentsByAmountClient as matchInvoicePaymentsByAmountAction,
	moveImportTransactionToPeriodClient as moveImportTransactionToPeriodAction,
	prepareImportAiAnalysisClient as prepareImportAiAnalysisAction,
	previewImportBalanceReconciliationClient as previewImportBalanceReconciliationAction,
	registerImportUploadClient as registerImportUploadAction,
	saveCategoryMappingsClient as saveCategoryMappings,
	saveImportBatchDraftClient as saveImportBatchDraftAction,
	syncImportBatchContextClient as syncImportBatchContextAction,
	syncImportBatchSourceTotalClient as syncImportBatchSourceTotalAction,
	undoImportClient as undoImportAction,
	updateCardLimitsFromInvoiceClient as updateCardLimitsFromInvoiceAction,
	updateImportExistingTransactionCategoryClient as updateImportExistingTransactionCategoryAction,
	updatePreviousInvoicePaymentDateClient as updatePreviousInvoicePaymentDateAction,
} from "@/features/transactions/lib/import-api-client";
import {
	fetchTransactionByIdClient,
	fetchTransactionDialogOptionsClient,
} from "@/features/transactions/lib/transactions-api-client";
import { CardLimitsCard } from "@/features/transactions/components/import/card-limits-card";
import {
	decodeAccountCard,
	encodeAccountCard,
	GlobalFields,
} from "@/features/transactions/components/import/global-fields";
import {
	ImportAiAnalysisBanner,
	type ImportAiAnalysisProgress,
	type ImportAiAnalysisStatus,
} from "@/features/transactions/components/import/import-ai-analysis-banner";
import type { ImportAccountBalancePrompt } from "@/features/transactions/components/import/import-confirm-dialog";
import { ImportFileHistory } from "@/features/transactions/components/import/import-file-history";
import type { ImportLinkMergeMode } from "@/features/transactions/components/import/import-link-dialog";
import {
	ImportProgressDialog,
	type ImportProgressStep,
} from "@/features/transactions/components/import/import-progress-dialog";
import { ImportSteps } from "@/features/transactions/components/import/import-steps";
import { ImportSummary } from "@/features/transactions/components/import/import-summary";
import { InvoiceTotalReconciliationBanner } from "@/features/transactions/components/import/invoice-total-reconciliation-banner";
import { PreviousInvoiceSettlementCard } from "@/features/transactions/components/import/previous-invoice-settlement-card";
import {
	ReviewTable,
	type ReviewRow,
} from "@/features/transactions/components/import/review-table";
import { UploadZone } from "@/features/transactions/components/import/upload-zone";
import type {
	SelectOption,
	TransactionItem,
} from "@/features/transactions/components/types";
import {
	applyImportAiPatchesToRows,
	buildImportAiAnalysisPayload,
	buildImportAiBatchJobs,
	buildImportAiPatchesFromResults,
	buildImportAiRowEditSnapshots,
	IMPORT_AI_PARALLEL_BATCH_LIMIT,
	type ImportAiBatchJob,
	type ImportAiRowResult,
	mergeImportAiAnalysisStats,
	partitionImportAiRows,
} from "@/features/transactions/lib/import-ai-analysis";
import {
	applyExistingAmountEdits,
	buildExistingAmountSnapshotMap,
	collectExistingAmountEdits,
	collectExistingInstallmentEdits,
	countExistingAmountEdits,
	countExistingInstallmentEdits,
	enrichReviewRowsWithExistingAmount,
	resolveExistingTransactionIdForAmountEdit,
} from "@/features/transactions/lib/import-amount-edit";
import {
	applyImportBatchDraftToExtraRows,
	applyImportBatchDraftToRows,
	buildImportBatchDraft,
	buildImportReviewRowKey,
	extractImportBatchDraftGlobals,
	type ImportBatchDraftData,
} from "@/features/transactions/lib/import-batch-draft";
import {
	IMPORT_BATCH_STATUS,
	isImportBatchDraft,
} from "@/features/transactions/lib/import-batch-status";
import {
	buildAccountImportHistoryHref,
	buildAccountStatementHref,
	buildImportHrefWithoutFlowParams,
	buildImportLandingHref,
	buildInvoiceImportHistoryHref,
} from "@/features/transactions/lib/import-continue-href";
import {
	buildTransferPeerAccountMap,
	type ImportDuplicateSnapshot,
	type ImportDuplicateValidation,
	inferImportRowTransferFromDuplicate,
	isImportLinkSuggestion,
	isImportRowLinked,
	isImportRowResolved,
	isVerifiedImportDuplicate,
	mergeImportDuplicateSnapshots,
	resolveImportDuplicateMatches,
} from "@/features/transactions/lib/import-duplicate-match";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import {
	filterImportHistoryEntries,
	hasImportHistoryFilter,
} from "@/features/transactions/lib/import-file-duplicate";
import {
	buildReviewInstallmentImport,
	countImportRecords,
	createManualInstallmentImport,
	createManualRecurrenceImport,
	isValidInstallmentImport,
	isValidRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import { applyInvoiceClosingToReviewRows } from "@/features/transactions/lib/import-invoice-closing";
import {
	collectInvoiceExtraRemovalTransactionIds,
	isInvoiceExtraReviewRow,
	mergeInvoiceReviewRowsWithExtras,
} from "@/features/transactions/lib/import-invoice-extra-rows";
import {
	guessInvoicePaymentCardId,
	guessInvoicePaymentPeriod,
	isInvoicePaymentDescription,
	sanitizeExcludedCardInvoicePaymentRow,
	shouldExcludeInvoicePaymentFromCardImport,
} from "@/features/transactions/lib/import-invoice-payment";
import {
	resolveAccountStatementDateRange,
	resolveCreditCardInvoicePeriodFromStatement,
	resolveImportPaymentDate,
	resolveUploadInvoicePeriodFromStatement,
} from "@/features/transactions/lib/import-invoice-period";
import {
	buildInvoicePeriodExistingIdSet,
	collectCrossPeriodReviewStats,
	collectFileExternalIds,
	dropExistingSnapshotAfterDelete,
	getRegisterSourceTotalPayload,
	mapDuplicateSnapshotToExistingRow,
	mapReviewRowToReconciliationRow,
	pickInvoicePeriodExistingSnapshots,
	shouldFetchInvoiceDuplicateSnapshots,
} from "@/features/transactions/lib/import-invoice-reconciliation";
import {
	buildImportLinkRequest,
	collectImportLinkSuggestionIndexes,
	resolveAutoLinkMergeDescription,
	resolveLinkedReviewRowState,
} from "@/features/transactions/lib/import-link-suggestions";
import { collectPeriodLockedTransactionIds } from "@/features/transactions/lib/import-move-period";
import { isImportReviewRowImportable } from "@/features/transactions/lib/import-review-filters";
import { guessImportTransfer } from "@/features/transactions/lib/import-transfer-detection";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { parseImportFileClient } from "@/features/transactions/lib/parse-import-file-client";
import { uploadImportSourceFile } from "@/features/transactions/lib/upload-import-source";
import {
	type InvoiceImportContext,
	validateInvoiceImportContext,
} from "@/features/transactions/lib/validate-invoice-import-context";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { AI_STORED_KEY_UNREADABLE_MESSAGE } from "@/shared/lib/ai/provider-messages";
import { IMPORT_PDF_PASSWORD_UNREADABLE_MESSAGE } from "@/shared/lib/cards/import-pdf-password";
import type { CategoryType } from "@/shared/lib/categories/constants";
import { INVOICE_PAYMENT_CATEGORY_NAME } from "@/shared/lib/categories/constants";
import {
	dedupeImportedTransactionsByFingerprint,
	normalizeImportedText,
	replaceAmbiguousImportExternalIds,
	stripImportExternalIdSuffix,
	uniquifyImportedExternalIds,
} from "@/shared/lib/import/helpers";
import {
	allocateInvoicePayments,
	applyRolloverCarryCorrectionToFileRows,
	buildPreviousInvoiceReview,
	collectInvoiceAmortizations,
	findInvoicePaymentDateFromFile,
	invoiceAmortizationsDiffer,
	resolvePreviousInvoiceSettlement,
	sumInvoiceRolloverCarry,
	sumInvoiceRolloverCharges,
} from "@/shared/lib/import/invoice-rollover";
import { resolveInvoiceSourceTotal } from "@/shared/lib/import/invoice-source-total";
import {
	collectInvoicePaymentRowsFromFile,
	computeImportReconciliation,
	isInvoiceTotalReconciled,
	sumInvoicePaymentRowsFromFile,
} from "@/shared/lib/import/invoice-total";
import { mapPdfLoadError } from "@/shared/lib/import/pdf-password";
import type { ImportStatement } from "@/shared/lib/import/types";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { formatCurrency } from "@/shared/utils/currency";
import {
	buildDateOnlyStringFromPeriodDay,
	formatDateOnly,
	getTodayDateString,
} from "@/shared/utils/date";
import {
	addMonthsToPeriod,
	displayPeriod,
	formatPeriodForUrl,
} from "@/shared/utils/period";

const TransactionDialog = dynamic(
	() =>
		import(
			"@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog"
		).then((mod) => mod.TransactionDialog),
	{ ssr: false },
);

const ImportConfirmDialog = dynamic(
	() =>
		import(
			"@/features/transactions/components/import/import-confirm-dialog"
		).then((mod) => mod.ImportConfirmDialog),
	{ ssr: false },
);

const ImportInvoicePeriodMismatchDialog = dynamic(
	() =>
		import(
			"@/features/transactions/components/import/import-invoice-period-mismatch-dialog"
		).then((mod) => mod.ImportInvoicePeriodMismatchDialog),
	{ ssr: false },
);

const ImportLinkDialog = dynamic(
	() =>
		import("@/features/transactions/components/import/import-link-dialog").then(
			(mod) => mod.ImportLinkDialog,
		),
	{ ssr: false },
);

const PreviousInvoiceFixDialog = dynamic(
	() =>
		import(
			"@/features/transactions/components/import/previous-invoice-fix-dialog"
		).then((mod) => mod.PreviousInvoiceFixDialog),
	{ ssr: false },
);

const LazyCreateCategoryInlineDialog = dynamic(
	() =>
		import("@/features/categories/components/create-category-inline-dialog").then(
			(mod) => mod.CreateCategoryInlineDialog,
		),
	{ ssr: false },
);

const LazyCreateAccountInlineDialog = dynamic(
	() =>
		import("@/features/accounts/components/create-account-inline-dialog").then(
			(mod) => mod.CreateAccountInlineDialog,
		),
	{ ssr: false },
);

function fileFromBase64(
	base64: string,
	fileName: string,
	mimeType: string,
): File {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new File([bytes], fileName, { type: mimeType });
}

const categoryGroupByTransactionType = {
	expense: "despesa",
	income: "receita",
} as const;

// Referências estáveis para defaults de props opcionais — evitam que useEffects de
// sincronização disparem a cada render (novo array a cada render geraria loop).
const EMPTY_AUTO_PDF_PASSWORD_ATTEMPTS: string[] = [];
const EMPTY_INITIAL_IMPORT_HISTORY: ImportFileHistoryEntry[] = [];

const normalizeCategoryName = (value: string) => value.trim().toLowerCase();

/**
 * Corrige, nas linhas do arquivo, o carrego apurado antes do último pagamento.
 *
 * A linha "valor pendente do mês anterior" é calculada no vencimento da fatura
 * passada. Um pagamento que chega depois reduz o saldo financiado, e o banco não
 * emite crédito por ele no extrato — só abate do total a pagar. Sem esse
 * ajuste a fatura entra maior do que o banco cobra, e a diferença aparece como
 * divergência sem causa.
 */
function correctRolloverCarryInStatement(
	statement: ImportStatement,
): ImportStatement {
	if (!statement.isCreditCard) return statement;

	const declaredTotal = statement.invoice?.totalAmount ?? null;
	const { transactions } = applyRolloverCarryCorrectionToFileRows(
		statement.transactions,
		declaredTotal,
	);

	return transactions === statement.transactions
		? statement
		: { ...statement, transactions };
}

function withNormalizedDescriptions(
	statement: ImportStatement,
): ImportStatement {
	const normalizedTransactions = statement.transactions.map((transaction) => ({
		...transaction,
		description: normalizeImportedText(transaction.description),
		categoryRaw: transaction.categoryRaw
			? normalizeImportedText(transaction.categoryRaw)
			: transaction.categoryRaw,
	}));

	return {
		...statement,
		// Ordem importa: primeiro troca o id que o arquivo repete em cobranças
		// diferentes (bloco do rotativo do Nubank), depois sufixa o que sobrou
		// repetido — aí o sufixo já significa "linha idêntica".
		transactions: dedupeImportedTransactionsByFingerprint(
			uniquifyImportedExternalIds(
				replaceAmbiguousImportExternalIds(normalizedTransactions),
			),
		),
	};
}

function buildDuplicateSnapshotByFitId(
	snapshots: ImportDuplicateSnapshot[],
): Map<string, ImportDuplicateSnapshot> {
	const map = new Map<string, ImportDuplicateSnapshot>();

	for (const snapshot of snapshots) {
		if (!snapshot.ofxFitId) continue;

		map.set(snapshot.ofxFitId, snapshot);

		const baseId = stripImportExternalIdSuffix(snapshot.ofxFitId);
		if (baseId !== snapshot.ofxFitId && !map.has(baseId)) {
			map.set(baseId, snapshot);
		}
	}

	return map;
}

function mergeSelectOptions(
	base: SelectOption[],
	extra: SelectOption[],
): SelectOption[] {
	const extraIds = new Set(extra.map((option) => option.value));
	return [...base.filter((option) => !extraIds.has(option.value)), ...extra];
}

function mapSelectOptionsToCategories(options: SelectOption[]): Category[] {
	return options.map((option) => ({
		id: option.value,
		name: option.label,
		type: option.group === "receita" ? "receita" : "despesa",
		icon: option.icon ?? null,
		parentId: option.parentId ?? null,
	}));
}

function mapAccountStatementReconciliationRows(rows: ReviewRow[]) {
	return rows
		.filter((row) => isAccountStatementMovementImportRow(row.kind))
		.map((row) => ({
			date: row.date,
			description: row.description,
			amount: row.amount,
			transactionType: row.transactionType,
			existingTransactionId:
				isImportRowResolved(row) || isImportRowLinked(row)
					? (row.linkedTransactionId ??
						row.duplicateValidation?.existingTransactionId ??
						null)
					: null,
		}));
}

interface ImportPageProps {
	payerOptions: SelectOption[];
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	/** Dia de vencimento por cartão, para sugerir a data do pagamento da fatura. */
	cardDueDays?: Record<string, string>;
	categoryOptions: SelectOption[];
	defaultPayerId: string | null;
	aiAnalysisEnabled?: boolean;
	aiDefaultModelId?: string | null;
	aiStoredKeysInvalid?: boolean;
	aiStoredKeysInvalidMessage?: string;
	initialCardId?: string | null;
	initialAccountId?: string | null;
	initialInvoicePeriod?: string | null;
	initialPaymentAccountId?: string | null;
	invoiceContext?: InvoiceImportContext | null;
	linkedCardId?: string | null;
	autoPdfPasswordAttempts?: string[];
	importPdfPasswordNeedsReconfigure?: boolean;
	initialImportHistory?: ImportFileHistoryEntry[];
	initialResumeBatchId?: string | null;
	importMountKey: string;
}

export function ImportPage({
	payerOptions,
	accountOptions,
	cardOptions,
	cardDueDays = {},
	categoryOptions,
	defaultPayerId,
	aiAnalysisEnabled = false,
	aiDefaultModelId = null,
	aiStoredKeysInvalid = false,
	aiStoredKeysInvalidMessage = AI_STORED_KEY_UNREADABLE_MESSAGE,
	initialCardId = null,
	initialAccountId = null,
	initialInvoicePeriod = null,
	initialPaymentAccountId = null,
	invoiceContext = null,
	linkedCardId = null,
	autoPdfPasswordAttempts = EMPTY_AUTO_PDF_PASSWORD_ATTEMPTS,
	importPdfPasswordNeedsReconfigure = false,
	initialImportHistory = EMPTY_INITIAL_IMPORT_HISTORY,
	initialResumeBatchId = null,
	importMountKey,
}: ImportPageProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isSavingDraft, startSaveDraftTransition] = useTransition();
	const [isImporting, setIsImporting] = useState(false);
	const [isChecking, setIsChecking] = useState(false);
	const [aiAnalysisStatus, setAiAnalysisStatus] =
		useState<ImportAiAnalysisStatus>("idle");
	const [aiAnalysisSummary, setAiAnalysisSummary] = useState<{
		categoriesSuggested: number;
		duplicatesFound: number;
		rowsAnalyzed: number;
		skippedByAlgorithm?: number;
	} | null>(null);
	const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
	const [aiAnalysisErrorLog, setAiAnalysisErrorLog] = useState<string | null>(
		null,
	);
	const [aiAnalysisProgress, setAiAnalysisProgress] =
		useState<ImportAiAnalysisProgress | null>(null);
	const aiAnalysisRunIdRef = useRef(0);
	const duplicateMatchingContextRef = useRef<string | null>(null);
	const [resumingBatchId, setResumingBatchId] = useState<string | null>(null);

	const prefilledAccountCardValue = initialCardId
		? encodeAccountCard("card", initialCardId)
		: initialAccountId
			? encodeAccountCard("account", initialAccountId)
			: null;

	const [statement, setStatement] = useState<ImportStatement | null>(null);
	const [rows, setRows] = useState<ReviewRow[]>([]);
	const [payerId, setPayerId] = useState<string | null>(defaultPayerId);
	const [accountCardValue, setAccountCardValue] = useState<string | null>(
		prefilledAccountCardValue,
	);
	const [invoicePeriod, setInvoicePeriod] = useState<string | null>(
		initialInvoicePeriod,
	);
	const [paymentAccountId, setPaymentAccountId] = useState<string | null>(
		initialPaymentAccountId ?? accountOptions[0]?.value ?? null,
	);
	const [paymentDate, setPaymentDate] = useState<string>(getTodayDateString());
	const [extraCategoryOptions, setExtraCategoryOptions] = useState<
		SelectOption[]
	>([]);
	const [extraAccountOptions, setExtraAccountOptions] = useState<
		SelectOption[]
	>([]);
	const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
	const [categoryCreateRowIndex, setCategoryCreateRowIndex] = useState<
		number | null
	>(null);
	const [categoryCreateBulk, setCategoryCreateBulk] = useState(false);
	const [accountCreateOpen, setAccountCreateOpen] = useState(false);
	const [accountCreateRowIndex, setAccountCreateRowIndex] = useState<
		number | null
	>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [accountBalancePreview, setAccountBalancePreview] =
		useState<ImportAccountBalancePrompt | null>(null);
	const [accountBalancePreviewLoading, setAccountBalancePreviewLoading] =
		useState(false);
	const [accountBalancePreviewError, setAccountBalancePreviewError] = useState<
		string | null
	>(null);
	const [payInvoiceOnImport, setPayInvoiceOnImport] = useState(false);
	const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
	const [fileError, setFileError] = useState<string | null>(null);
	const [activeInvoiceContext, setActiveInvoiceContext] =
		useState<InvoiceImportContext | null>(invoiceContext);
	const [periodMismatch, setPeriodMismatch] = useState<{
		statement: ImportStatement;
		filePeriod: string;
		expectedPeriod: string;
		cardName: string;
	} | null>(null);
	const [sourceFile, setSourceFile] = useState<File | null>(null);
	const [uploadImportBatchId, setUploadImportBatchId] = useState<string | null>(
		null,
	);
	const [invoicePeriodExistingSnapshots, setInvoicePeriodExistingSnapshots] =
		useState<ImportDuplicateSnapshot[]>([]);
	const [periodLockedExistingIds, setPeriodLockedExistingIds] = useState<
		Set<string>
	>(() => new Set());
	const [invoiceTotalOverrideConfirmed, setInvoiceTotalOverrideConfirmed] =
		useState(false);
	const [importSourceStored, setImportSourceStored] = useState(false);
	const [awaitingResumeBatch, setAwaitingResumeBatch] = useState<{
		batchId: string;
		sourceFileName: string;
		draftData: ImportBatchDraftData | null;
	} | null>(null);
	const [importHistory, setImportHistory] = useState(initialImportHistory);

	const importHistoryFilter = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;

		if (activeInvoiceContext) {
			return {
				cardId: activeInvoiceContext.cardId,
				invoicePeriod:
					invoicePeriod ??
					activeInvoiceContext.invoicePeriod ??
					initialInvoicePeriod ??
					null,
				accountId: null,
			};
		}

		if (decoded?.type === "card") {
			return {
				cardId: decoded.id,
				invoicePeriod: invoicePeriod ?? initialInvoicePeriod ?? null,
				accountId: null,
			};
		}

		if (decoded?.type === "account") {
			return {
				cardId: null,
				invoicePeriod: null,
				accountId: decoded.id,
			};
		}

		if (initialAccountId) {
			return {
				cardId: null,
				invoicePeriod: null,
				accountId: initialAccountId,
			};
		}

		if (initialCardId) {
			return {
				cardId: initialCardId,
				invoicePeriod: invoicePeriod ?? initialInvoicePeriod ?? null,
				accountId: null,
			};
		}

		return {
			cardId: null,
			invoicePeriod: null,
			accountId: null,
		};
	}, [
		accountCardValue,
		activeInvoiceContext,
		invoicePeriod,
		initialInvoicePeriod,
		initialAccountId,
		initialCardId,
	]);

	const contextualImportHistory = useMemo(
		() =>
			hasImportHistoryFilter(importHistoryFilter)
				? filterImportHistoryEntries(importHistory, importHistoryFilter)
				: importHistory,
		[importHistory, importHistoryFilter],
	);

	const resumableDraftEntry = useMemo(() => {
		if (!hasImportHistoryFilter(importHistoryFilter)) return null;

		return (
			contextualImportHistory.find(
				(entry) => isImportBatchDraft(entry.status) && entry.hasAttachment,
			) ?? null
		);
	}, [contextualImportHistory, importHistoryFilter]);

	const batchIdToResume =
		initialResumeBatchId ?? resumableDraftEntry?.id ?? null;

	const refreshImportHistory = useCallback(async () => {
		try {
			const entries = await fetchImportBatchHistoryAction({
				cardId: importHistoryFilter.cardId,
				invoicePeriod: importHistoryFilter.cardId
					? importHistoryFilter.invoicePeriod
					: null,
				accountId: importHistoryFilter.accountId,
				limit: 50,
			});
			setImportHistory(entries);
		} catch {
			// Restart do dev server ou abort da Server Action.
		}
	}, [importHistoryFilter]);
	const [editTransaction, setEditTransaction] =
		useState<TransactionItem | null>(null);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [linkDialogIndex, setLinkDialogIndex] = useState<number | null>(null);
	const [isLinking, setIsLinking] = useState(false);
	const autoLinkSignatureRef = useRef<string | null>(null);
	const [editDialogOptions, setEditDialogOptions] =
		useState<TransactionDialogOptions | null>(null);

	/**
	 * Etapa do preparo da importação, para o modal de progresso.
	 *
	 * Cobre o intervalo em que `statement` e `rows` são preenchidos aos poucos e
	 * o passo do fluxo oscilava, fazendo a tela piscar.
	 */
	const [importProgress, setImportProgress] =
		useState<ImportProgressStep | null>(null);

	const importSessionKey = importMountKey;
	const previousSessionKeyRef = useRef(importSessionKey);
	const resumeAttemptedRef = useRef(false);

	const resetImportState = useCallback(() => {
		setStatement(null);
		setRows([]);
		setSourceFile(null);
		setUploadImportBatchId(null);
		setImportSourceStored(false);
		setAwaitingResumeBatch(null);
		setFileError(null);
		setPeriodMismatch(null);
		setConfirmOpen(false);
		setIsChecking(false);
		setActiveInvoiceContext(invoiceContext);
		setPayerId(defaultPayerId);
		setAccountCardValue(
			initialCardId
				? encodeAccountCard("card", initialCardId)
				: initialAccountId
					? encodeAccountCard("account", initialAccountId)
					: null,
		);
		setInvoicePeriod(initialInvoicePeriod);
		setPaymentAccountId(
			initialPaymentAccountId ?? accountOptions[0]?.value ?? null,
		);
		setPaymentDate(getTodayDateString());
		setExtraCategoryOptions([]);
		setCategoryCreateOpen(false);
		setCategoryCreateRowIndex(null);
		setCategoryCreateBulk(false);
		setAiAnalysisStatus("idle");
		setAiAnalysisSummary(null);
		setAiAnalysisError(null);
		setAiAnalysisErrorLog(null);
		setAiAnalysisProgress(null);
		setInvoicePeriodExistingSnapshots([]);
		setPeriodLockedExistingIds(new Set());
		setInvoiceTotalOverrideConfirmed(false);
		duplicateMatchingContextRef.current = null;
		aiAnalysisRunIdRef.current += 1;
	}, [
		invoiceContext,
		defaultPayerId,
		initialCardId,
		initialAccountId,
		initialInvoicePeriod,
		initialPaymentAccountId,
		accountOptions,
	]);

	const ensureImportBatchIdForDraft = useCallback(async () => {
		if (uploadImportBatchId) {
			return uploadImportBatchId;
		}

		if (!sourceFile) {
			return null;
		}

		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const registerResult = await registerImportUploadAction({
			sourceFileName: sourceFile.name,
			sourceFileSize: sourceFile.size,
			cardId: decoded?.type === "card" ? decoded.id : (initialCardId ?? null),
			invoicePeriod:
				invoicePeriod ??
				initialInvoicePeriod ??
				activeInvoiceContext?.invoicePeriod ??
				null,
			accountId: decoded?.type === "account" ? decoded.id : null,
			...(statement ? getRegisterSourceTotalPayload(statement) : {}),
		});

		if (!registerResult.success) {
			toast.error(
				registerResult.error ??
					"Não foi possível registrar a importação para salvar o rascunho.",
			);
			return null;
		}

		setUploadImportBatchId(registerResult.importBatchId);
		return registerResult.importBatchId;
	}, [
		accountCardValue,
		activeInvoiceContext?.invoicePeriod,
		initialCardId,
		initialInvoicePeriod,
		invoicePeriod,
		sourceFile,
		statement,
		uploadImportBatchId,
	]);

	useEffect(() => {
		setImportHistory(initialImportHistory);
	}, [initialImportHistory]);

	useEffect(() => {
		if (!hasImportHistoryFilter(importHistoryFilter)) return;
		void refreshImportHistory();
	}, [importHistoryFilter, refreshImportHistory]);

	useEffect(() => {
		if (previousSessionKeyRef.current === importSessionKey) return;
		previousSessionKeyRef.current = importSessionKey;
		resumeAttemptedRef.current = false;
		resetImportState();
	}, [importSessionKey, resetImportState]);

	const mergedCategoryOptions = useMemo(
		() => mergeSelectOptions(categoryOptions, extraCategoryOptions),
		[categoryOptions, extraCategoryOptions],
	);

	const allCategoriesForDialog = useMemo(
		() => mapSelectOptionsToCategories(mergedCategoryOptions),
		[mergedCategoryOptions],
	);

	const categoryGroupById = useMemo(
		() =>
			new Map(
				mergedCategoryOptions.map((option) => [option.value, option.group]),
			),
		[mergedCategoryOptions],
	);

	const pagamentosCategoryId = useMemo(
		() =>
			mergedCategoryOptions.find(
				(option) => option.label === INVOICE_PAYMENT_CATEGORY_NAME,
			)?.value ?? null,
		[mergedCategoryOptions],
	);

	const isCategoryCompatible = useCallback(
		(
			categoryId: string | null,
			transactionType: ReviewRow["transactionType"],
		) =>
			!categoryId ||
			categoryGroupById.get(categoryId) ===
				categoryGroupByTransactionType[transactionType],
		[categoryGroupById],
	);

	const resolveImportCategoryLabel = useCallback(
		(categoryId: string | null | undefined) => {
			if (!categoryId) return "Sem categoria";
			return (
				mergedCategoryOptions.find((option) => option.value === categoryId)
					?.label ?? "Sem categoria"
			);
		},
		[mergedCategoryOptions],
	);

	const triggerImportAiAnalysis = useCallback(
		async (
			reviewRows: ReviewRow[],
			context: {
				isCreditCard: boolean;
				cardId: string | null;
				accountId: string | null;
				invoicePeriods: string[];
				statementPeriod: { from: string; to: string } | null;
				cardName: string | null;
				accountName: string | null;
			},
		) => {
			if (!aiAnalysisEnabled || reviewRows.length === 0) {
				setAiAnalysisStatus("skipped");
				return;
			}

			const runId = aiAnalysisRunIdRef.current + 1;
			aiAnalysisRunIdRef.current = runId;
			const startedAt = Date.now();
			setAiAnalysisStatus("running");
			setAiAnalysisSummary(null);
			setAiAnalysisError(null);
			setAiAnalysisErrorLog(null);
			setAiAnalysisProgress({
				phase: "preparing",
				message: "Preparando análise com IA…",
				startedAt,
			});

			try {
				const categories = mergedCategoryOptions.map((option) => ({
					id: option.value,
					name: option.label,
					transactionType:
						option.group === "receita"
							? ("income" as const)
							: ("expense" as const),
				}));

				const categoryCompatibility = mergedCategoryOptions.flatMap((option) =>
					(["income", "expense"] as const).map((transactionType) => ({
						categoryId: option.value,
						transactionType,
						compatible: isCategoryCompatible(option.value, transactionType),
					})),
				);

				const payload = buildImportAiAnalysisPayload({
					modelId: aiDefaultModelId,
					rows: reviewRows,
					isCreditCard: context.isCreditCard,
					cardId: context.cardId,
					invoicePeriods: context.invoicePeriods,
					accountId: context.accountId,
					statementPeriod: context.statementPeriod,
					cardName: context.cardName,
					accountName: context.accountName,
					categories,
					categoryCompatibility,
				});

				const partitioned = partitionImportAiRows(payload.rows);
				const batchJobs = buildImportAiBatchJobs(partitioned);
				const rowEditSnapshots = buildImportAiRowEditSnapshots(reviewRows);

				if (batchJobs.length === 0) {
					setAiAnalysisStatus("skipped");
					setAiAnalysisProgress(null);
					return;
				}

				if (runId !== aiAnalysisRunIdRef.current) return;

				setAiAnalysisProgress({
					phase: "preparing",
					message: "Carregando modelo, credenciais e candidatos a duplicata…",
					startedAt,
					rowCount:
						partitioned.categoryRows.length + partitioned.duplicateRows.length,
					skippedByAlgorithm: partitioned.skippedCount,
				});

				const prepared = await prepareImportAiAnalysisAction(payload);

				if (runId !== aiAnalysisRunIdRef.current) return;

				if (!prepared.success) {
					setAiAnalysisError(prepared.error);
					setAiAnalysisErrorLog(prepared.errorLog);
					setAiAnalysisStatus("error");
					setAiAnalysisProgress(null);
					toast.warning(prepared.error);
					return;
				}

				if (prepared.skipped) {
					setAiAnalysisStatus("skipped");
					setAiAnalysisProgress(null);
					return;
				}

				let cumulativeStats = {
					categoriesSuggested: 0,
					duplicatesFound: 0,
					rowsAnalyzed: 0,
				};

				const applyBatchResults = (aiResults: ImportAiRowResult[]) => {
					const patches = buildImportAiPatchesFromResults({
						rows: payload.rows,
						categoryCompatibility: payload.categoryCompatibility,
						aiResults,
						existingSnapshots: prepared.data.existingSnapshots,
					});

					setRows((previousRows) =>
						applyImportAiPatchesToRows(previousRows, patches, {
							rowEditSnapshots,
						}),
					);

					cumulativeStats = mergeImportAiAnalysisStats(
						cumulativeStats,
						patches,
						aiResults.length,
					);
					setAiAnalysisSummary({
						...cumulativeStats,
						skippedByAlgorithm: prepared.data.skippedRowCount,
					});
				};

				const processBatchJob = async (job: ImportAiBatchJob) => {
					if (runId !== aiAnalysisRunIdRef.current) {
						return null;
					}

					setAiAnalysisProgress({
						phase:
							job.analysisMode === "category"
								? "categorizing"
								: "checking_duplicates",
						message:
							job.analysisMode === "category"
								? `Sugerindo categorias · lote ${job.phaseBatchIndex + 1} de ${job.phaseTotalBatches}`
								: `Verificando duplicatas ambíguas · lote ${job.phaseBatchIndex + 1} de ${job.phaseTotalBatches}`,
						currentBatch: job.globalBatchIndex + 1,
						totalBatches: job.globalTotalBatches,
						modelLabel: prepared.data.modelLabel,
						rowsAnalyzed: cumulativeStats.rowsAnalyzed,
						rowCount:
							partitioned.categoryRows.length +
							partitioned.duplicateRows.length,
						candidateCount: prepared.data.candidateCount,
						categoriesApplied: cumulativeStats.categoriesSuggested,
						startedAt,
						skippedByAlgorithm: prepared.data.skippedRowCount,
					});

					const batchResult = await analyzeImportAiBatchAction({
						...payload,
						rows: job.rows,
						analysisMode: job.analysisMode,
						batchIndex: job.phaseBatchIndex,
						totalBatches: job.phaseTotalBatches,
						preparedModelId: prepared.data.modelId,
						existingCandidates: prepared.data.existingCandidates,
					});

					if (runId !== aiAnalysisRunIdRef.current) {
						return null;
					}

					if (!batchResult.success) {
						throw batchResult;
					}

					return batchResult.data.rows;
				};

				const categoryJobs = batchJobs.filter(
					(job) => job.analysisMode === "category",
				);
				const duplicateJobs = batchJobs.filter(
					(job) => job.analysisMode === "duplicate",
				);

				for (
					let index = 0;
					index < categoryJobs.length;
					index += IMPORT_AI_PARALLEL_BATCH_LIMIT
				) {
					const slice = categoryJobs.slice(
						index,
						index + IMPORT_AI_PARALLEL_BATCH_LIMIT,
					);
					const results = await Promise.all(slice.map(processBatchJob));
					for (const batchRows of results) {
						if (!batchRows || batchRows.length === 0) continue;
						applyBatchResults(batchRows);
					}
				}

				for (
					let index = 0;
					index < duplicateJobs.length;
					index += IMPORT_AI_PARALLEL_BATCH_LIMIT
				) {
					const slice = duplicateJobs.slice(
						index,
						index + IMPORT_AI_PARALLEL_BATCH_LIMIT,
					);
					const results = await Promise.all(slice.map(processBatchJob));
					for (const batchRows of results) {
						if (!batchRows || batchRows.length === 0) continue;
						applyBatchResults(batchRows);
					}
				}

				if (runId !== aiAnalysisRunIdRef.current) return;

				setAiAnalysisStatus("done");
				setAiAnalysisProgress(null);
			} catch (error) {
				if (runId !== aiAnalysisRunIdRef.current) return;

				console.error("Erro na análise de importação com IA:", error);

				if (
					typeof error === "object" &&
					error &&
					"success" in error &&
					error.success === false &&
					"error" in error
				) {
					const batchError = error as {
						error: string;
						errorLog?: string;
					};
					setAiAnalysisError(batchError.error);
					setAiAnalysisErrorLog(batchError.errorLog ?? null);
					setAiAnalysisStatus("error");
					setAiAnalysisProgress(null);
					toast.warning(batchError.error);
					return;
				}

				const message = "Não foi possível concluir a análise com IA.";
				setAiAnalysisError(message);
				setAiAnalysisErrorLog(
					error instanceof Error
						? `${error.name}: ${error.message}`
						: String(error),
				);
				setAiAnalysisStatus("error");
				setAiAnalysisProgress(null);
				toast.warning(message);
			}
		},
		[
			aiAnalysisEnabled,
			aiDefaultModelId,
			isCategoryCompatible,
			mergedCategoryOptions,
		],
	);

	const selectedCardOption = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const cardId =
			decoded?.type === "card" ? decoded.id : (initialCardId ?? null);
		if (!cardId) return null;
		return cardOptions.find((option) => option.value === cardId) ?? null;
	}, [accountCardValue, cardOptions, initialCardId]);

	const selectedAccountCardSummary = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		if (!decoded) return null;

		const options = decoded.type === "card" ? cardOptions : accountOptions;
		const option = options.find((entry) => entry.value === decoded.id);
		if (!option) return null;

		return {
			label: option.label,
			logo: option.logo,
			isCard: decoded.type === "card",
		};
	}, [accountCardValue, accountOptions, cardOptions]);

	const handleRetryImportAiAnalysis = useCallback(() => {
		if (!statement || rows.length === 0) {
			toast.error("Nenhum lançamento disponível para reprocessar com IA.");
			return;
		}

		const resolvedCardId =
			activeInvoiceContext?.cardId ??
			selectedCardOption?.value ??
			initialCardId ??
			linkedCardId ??
			null;

		const resolvedAccountId = (() => {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			if (decoded?.type === "account") return decoded.id;
			return initialAccountId ?? null;
		})();

		const statementPeriod = resolveAccountStatementDateRange(statement);

		const shouldFetchAccountSnapshots =
			!statement.isCreditCard && resolvedAccountId && statementPeriod;

		const invoicePeriodsForSnapshots = [
			...new Set(
				[
					invoicePeriod,
					activeInvoiceContext?.invoicePeriod,
					initialInvoicePeriod,
				].filter((period): period is string => Boolean(period)),
			),
		];

		void triggerImportAiAnalysis(rows, {
			isCreditCard: statement.isCreditCard,
			cardId: resolvedCardId,
			accountId: resolvedAccountId,
			invoicePeriods: invoicePeriodsForSnapshots,
			statementPeriod: shouldFetchAccountSnapshots ? statementPeriod : null,
			cardName: selectedCardOption?.label ?? null,
			accountName:
				accountOptions.find((option) => option.value === resolvedAccountId)
					?.label ?? null,
		});
	}, [
		accountCardValue,
		accountOptions,
		activeInvoiceContext,
		initialAccountId,
		initialInvoicePeriod,
		invoicePeriod,
		linkedCardId,
		initialCardId,
		rows,
		selectedCardOption,
		statement,
		triggerImportAiAnalysis,
	]);

	const applyStatementInvoicePeriod = useCallback(
		(stmt: ImportStatement) => {
			if (!stmt.isCreditCard) return;

			const period = resolveCreditCardInvoicePeriodFromStatement(
				stmt,
				selectedCardOption,
			);

			if (period) {
				setInvoicePeriod(period);
			}
		},
		[selectedCardOption],
	);

	/** Preenche cartão e fatura dos pagamentos que o valor identifica sozinho. */
	const applyInvoicePaymentAmountMatches = useCallback(
		async (builtRows: ReviewRow[]) => {
			const pending = builtRows
				.map((row, index) => ({ row, index }))
				.filter(
					({ row }) =>
						row.kind === "invoice_payment" && !row.invoicePaymentCardId,
				);

			if (pending.length === 0) return;

			const matches = await matchInvoicePaymentsByAmountAction(
				pending.map(({ row, index }) => ({
					key: String(index),
					amount: row.amount,
					date: row.date,
				})),
			);

			setRows((previous) =>
				previous.map((row, index) => {
					const match = matches[String(index)];
					if (!match) return row;
					if (row.kind !== "invoice_payment") return row;
					// Não sobrescreve escolha que o usuário já fez enquanto buscávamos.
					if (row.invoicePaymentCardId) return row;

					return {
						...row,
						invoicePaymentCardId: match.cardId,
						invoicePaymentPeriod: match.period,
					};
				}),
			);
		},
		[],
	);

	const processParsedStatement = useCallback(
		async (
			stmt: ImportStatement,
			options?: { draftData?: ImportBatchDraftData | null },
		) => {
			/*
			 * A correção do carrego vem depois da normalização, que é onde os ids
			 * sintéticos ganham forma final — refazer o id da linha ajustada só faz
			 * sentido com eles já prontos.
			 */
			const normalizedStatement = correctRolloverCarryInStatement(
				withNormalizedDescriptions(stmt),
			);
			setStatement(normalizedStatement);

			let periodFromFile: string | null = null;
			if (normalizedStatement.isCreditCard) {
				periodFromFile = resolveCreditCardInvoicePeriodFromStatement(
					normalizedStatement,
					selectedCardOption,
				);
				if (periodFromFile) {
					setInvoicePeriod(periodFromFile);
				}

				if (normalizedStatement.invoice) {
					setPaymentDate(resolveImportPaymentDate(normalizedStatement.invoice));
				}
			}

			const resolvedCardId = (() => {
				const decoded = accountCardValue
					? decodeAccountCard(accountCardValue)
					: null;
				if (decoded?.type === "card") return decoded.id;

				return (
					activeInvoiceContext?.cardId ??
					selectedCardOption?.value ??
					initialCardId ??
					linkedCardId ??
					null
				);
			})();

			const resolvedInvoicePeriod =
				periodFromFile ??
				activeInvoiceContext?.invoicePeriod ??
				initialInvoicePeriod ??
				null;

			const resolvedAccountId = (() => {
				const decoded = accountCardValue
					? decodeAccountCard(accountCardValue)
					: null;
				if (decoded?.type === "account") return decoded.id;
				return initialAccountId ?? null;
			})();

			const statementPeriod =
				resolveAccountStatementDateRange(normalizedStatement);

			setIsChecking(true);
			setImportProgress("matching");
			duplicateMatchingContextRef.current = null;

			try {
				const fitIds = normalizedStatement.transactions
					.map((t) => t.externalId)
					.filter((id): id is string => id !== null);

				const shouldFetchInvoiceSnapshots =
					shouldFetchInvoiceDuplicateSnapshots({
						statementIsCreditCard: stmt.isCreditCard,
						resolvedCardId,
						accountCardValue,
						activeInvoiceContextCardId: activeInvoiceContext?.cardId ?? null,
						initialCardId: initialCardId ?? null,
					});

				const shouldFetchAccountSnapshots =
					!shouldFetchInvoiceSnapshots && resolvedAccountId && statementPeriod;

				const invoicePeriodsForSnapshots = [
					...new Set(
						[
							resolvedInvoicePeriod,
							activeInvoiceContext?.invoicePeriod,
							initialInvoicePeriod,
						].filter((period): period is string => Boolean(period)),
					),
				];

				const [
					duplicates,
					descriptionMemory,
					duplicateSnapshots,
					invoicePeriodSnapshotGroups,
					cardInstallmentSnapshots,
					accountImportSnapshots,
				] = await Promise.all([
					checkDuplicateFitIds(fitIds).then((ids) => new Set(ids)),
					fetchImportDescriptionMemory(
						normalizedStatement.transactions.map((t) => t.description),
					),
					fetchImportDuplicateSnapshots(fitIds),
					shouldFetchInvoiceSnapshots && resolvedCardId
						? Promise.all(
								invoicePeriodsForSnapshots.map((period) =>
									fetchInvoicePeriodDuplicateSnapshots(resolvedCardId, period),
								),
							)
						: Promise.resolve([]),
					shouldFetchInvoiceSnapshots && resolvedCardId
						? fetchCardInstallmentDuplicateSnapshots(resolvedCardId)
						: Promise.resolve([]),
					shouldFetchAccountSnapshots
						? fetchAccountImportDuplicateSnapshots(
								resolvedAccountId,
								statementPeriod.from,
								statementPeriod.to,
							)
						: Promise.resolve([]),
				]);

				const invoicePeriodSnapshots = mergeImportDuplicateSnapshots(
					...invoicePeriodSnapshotGroups,
				);

				const activePeriodForReconciliation =
					resolvedInvoicePeriod ?? invoicePeriodsForSnapshots[0] ?? null;
				setInvoicePeriodExistingSnapshots(
					pickInvoicePeriodExistingSnapshots(
						invoicePeriodsForSnapshots,
						invoicePeriodSnapshotGroups,
						activePeriodForReconciliation,
					),
				);
				setInvoiceTotalOverrideConfirmed(false);

				const duplicateSnapshotByFitId =
					buildDuplicateSnapshotByFitId(duplicateSnapshots);

				const semanticCandidates = shouldFetchInvoiceSnapshots
					? mergeImportDuplicateSnapshots(
							invoicePeriodSnapshots,
							cardInstallmentSnapshots,
						)
					: accountImportSnapshots;

				const transferPeerByTransactionId =
					buildTransferPeerAccountMap(semanticCandidates);

				setPeriodLockedExistingIds(
					collectPeriodLockedTransactionIds(semanticCandidates),
				);

				const duplicateMatchOptions = {
					invoicePeriods: invoicePeriodsForSnapshots,
				};

				const rowInputs = normalizedStatement.transactions.map((t) => {
					const isInvoicePayment = isInvoicePaymentDescription(t.description);
					return {
						...t,
						installmentImport: isInvoicePayment
							? null
							: buildReviewInstallmentImport(t.description),
					};
				});

				const draftData = options?.draftData ?? null;
				const draftByKey = draftData
					? new Map(draftData.rows.map((row) => [row.key, row]))
					: null;

				const duplicateStates = resolveImportDuplicateMatches(
					rowInputs.map((row) => {
						const draftRow = draftByKey?.get(
							buildImportReviewRowKey({
								externalId: row.externalId,
								date: row.date,
								amount: row.amount,
								description: row.description,
							}),
						);

						return {
							date: row.date,
							amount: row.amount,
							description: row.description,
							transactionType: row.transactionType,
							installmentImport: row.installmentImport,
							externalId: row.externalId,
							linked: draftRow?.linked,
							linkedTransactionId: draftRow?.linkedTransactionId,
						};
					}),
					{
						candidates: semanticCandidates,
						fitIdDuplicateIds: duplicates,
						duplicateSnapshotByFitId,
						options: duplicateMatchOptions,
					},
				);

				duplicateMatchingContextRef.current = [
					resolvedCardId ?? "no-card",
					resolvedAccountId ?? "no-account",
					invoicePeriodsForSnapshots.join(","),
				].join(":");

				const builtRows = normalizedStatement.transactions.map((t, index) => {
					const isInvoicePayment = isInvoicePaymentDescription(t.description);
					const excludeInvoicePaymentOnCard =
						shouldExcludeInvoicePaymentFromCardImport({
							description: t.description,
							isCreditCardStatement: stmt.isCreditCard,
						});
					const treatAsInvoicePayment =
						isInvoicePayment && !excludeInvoicePaymentOnCard;
					const transferGuess = treatAsInvoicePayment
						? null
						: guessImportTransfer(
								t.description,
								t.transactionType,
								accountOptions,
								resolvedAccountId,
								normalizedStatement.accountHolder,
							);
					const guessedCardId = treatAsInvoicePayment
						? guessInvoicePaymentCardId(t.description, cardOptions)
						: null;
					const guessedPeriod = treatAsInvoicePayment
						? guessInvoicePaymentPeriod(t.date, cardOptions, guessedCardId)
						: null;

					const descriptionKey = normalizeDescriptionKey(t.description);
					const remembered = descriptionMemory[descriptionKey];

					let mappedCategoryId = remembered?.categoryId ?? null;
					const mappedPayerId = remembered?.payerId ?? payerId;

					if (t.categoryRaw) {
						const categoryRaw = normalizeCategoryName(t.categoryRaw);
						const matchedOption = categoryOptions.find(
							(opt) => normalizeCategoryName(opt.label) === categoryRaw,
						);
						if (matchedOption) {
							mappedCategoryId = matchedOption.value;
						}
					}

					if (treatAsInvoicePayment && pagamentosCategoryId) {
						mappedCategoryId = pagamentosCategoryId;
					}

					const installmentImport = rowInputs[index].installmentImport;
					const duplicateState = duplicateStates[index];
					const isDuplicate = duplicateState.isDuplicate;
					const duplicateValidation = duplicateState.duplicateValidation;
					const isLinkSuggestion =
						duplicateValidation?.status === "link_suggestion";
					const duplicateTransfer = inferImportRowTransferFromDuplicate(
						duplicateValidation,
						transferPeerByTransactionId,
					);

					let resolvedCategoryId =
						transferGuess || duplicateTransfer || treatAsInvoicePayment
							? treatAsInvoicePayment
								? pagamentosCategoryId
								: null
							: isCategoryCompatible(mappedCategoryId, t.transactionType)
								? mappedCategoryId
								: null;

					let resolvedPayerId = mappedPayerId;

					if (isLinkSuggestion && duplicateValidation) {
						resolvedPayerId =
							duplicateValidation.existingPayerId ?? resolvedPayerId;

						if (
							!resolvedCategoryId &&
							duplicateValidation.existingCategoryId &&
							isCategoryCompatible(
								duplicateValidation.existingCategoryId,
								t.transactionType,
							)
						) {
							resolvedCategoryId = duplicateValidation.existingCategoryId;
						}
					}

					return {
						...t,
						reviewKey: crypto.randomUUID(),
						sourceDescription: t.description,
						originalDraftKey: buildImportReviewRowKey({
							externalId: t.externalId,
							date: t.date,
							amount: t.amount,
							description: t.description,
						}),
						isDuplicate,
						selected: !(
							isDuplicate ||
							isLinkSuggestion ||
							excludeInvoicePaymentOnCard
						),
						duplicateValidation,
						linked: false,
						linkedTransactionId: null,
						payerId: resolvedPayerId,
						kind: transferGuess?.kind
							? transferGuess.kind
							: duplicateTransfer?.kind
								? duplicateTransfer.kind
								: treatAsInvoicePayment
									? ("invoice_payment" as const)
									: ("transaction" as const),
						invoicePaymentCardId: guessedCardId,
						invoicePaymentPeriod: guessedPeriod,
						transferPeerAccountId:
							transferGuess?.transferPeerAccountId ??
							duplicateTransfer?.transferPeerAccountId ??
							null,
						installmentImport: transferGuess ? null : installmentImport,
						recurrenceImport: null,
						categoryId: resolvedCategoryId,
						existingTransactionId: null,
					};
				});

				const rowsWithDraft = draftData
					? applyImportBatchDraftToRows(builtRows, draftData)
					: builtRows;

				const periodSnapshots = pickInvoicePeriodExistingSnapshots(
					invoicePeriodsForSnapshots,
					invoicePeriodSnapshotGroups,
					activePeriodForReconciliation,
				);

				const closedRows =
					shouldFetchInvoiceSnapshots && activePeriodForReconciliation
						? applyInvoiceClosingToReviewRows({
								rows: rowsWithDraft,
								snapshots: periodSnapshots,
								options: { invoicePeriods: invoicePeriodsForSnapshots },
							})
						: rowsWithDraft;

				const mergedRows =
					shouldFetchInvoiceSnapshots && activePeriodForReconciliation
						? mergeInvoiceReviewRowsWithExtras({
								fileRows: closedRows,
								snapshots: periodSnapshots,
								fileExternalIds: collectFileExternalIds(closedRows, fitIds),
								previousRows: closedRows,
							})
						: closedRows.filter((row) => !isInvoiceExtraReviewRow(row));

				// Só as linhas de excesso, que nascem depois do fechamento: reaplicar o
				// rascunho em tudo apagaria a decisão fresca do fechamento com o estado
				// salvo antes dele existir (ver applyImportBatchDraftToExtraRows).
				const finalRows = draftData
					? applyImportBatchDraftToExtraRows(mergedRows, draftData)
					: mergedRows;

				const existingAmountById =
					buildExistingAmountSnapshotMap(periodSnapshots);
				const sanitizedRows = enrichReviewRowsWithExistingAmount(
					finalRows,
					existingAmountById,
				).map((row) =>
					sanitizeExcludedCardInvoicePaymentRow(row, stmt.isCreditCard),
				);

				setRows(sanitizedRows);

				/*
				 * Vincula o pagamento de fatura ao cartão pelo valor.
				 *
				 * O extrato descreve só "Pagamento de fatura", sem cartão nem
				 * período, e o palpite por nome não tem o que casar. O valor tem: o
				 * total da fatura identifica qual foi. Roda depois de a revisão já
				 * estar na tela, porque é conveniência — se demorar ou falhar, o
				 * usuário escolhe à mão como antes.
				 */
				void applyInvoicePaymentAmountMatches(sanitizedRows);

				void triggerImportAiAnalysis(
					sanitizedRows.filter((row) => !isInvoiceExtraReviewRow(row)),
					{
						isCreditCard: stmt.isCreditCard,
						cardId: resolvedCardId,
						accountId: resolvedAccountId,
						invoicePeriods: invoicePeriodsForSnapshots,
						statementPeriod: shouldFetchAccountSnapshots
							? statementPeriod
							: null,
						cardName: selectedCardOption?.label ?? null,
						accountName:
							accountOptions.find(
								(option) => option.value === resolvedAccountId,
							)?.label ?? null,
					},
				);

				if (draftData) {
					const globals = extractImportBatchDraftGlobals(draftData);
					if (globals.payerId) setPayerId(globals.payerId);
					if (globals.accountCardValue) {
						setAccountCardValue(globals.accountCardValue);
					}
					if (globals.invoicePeriod) setInvoicePeriod(globals.invoicePeriod);
					if (globals.paymentAccountId) {
						setPaymentAccountId(globals.paymentAccountId);
					}
					if (globals.paymentDate) setPaymentDate(globals.paymentDate);
				}
			} catch (error) {
				console.error("Erro ao processar extrato para revisão:", error);
				const message =
					error instanceof Error && error.message
						? error.message
						: "Não foi possível preparar a revisão do arquivo importado.";
				setFileError(message);
				toast.error(message);
				setStatement(null);
				setRows([]);
			} finally {
				setIsChecking(false);
				setImportProgress(null);
			}
		},
		[
			activeInvoiceContext,
			accountCardValue,
			initialAccountId,
			initialCardId,
			initialInvoicePeriod,
			isCategoryCompatible,
			linkedCardId,
			payerId,
			categoryOptions,
			cardOptions,
			pagamentosCategoryId,
			selectedCardOption,
			triggerImportAiAnalysis,
			accountOptions,
			applyInvoicePaymentAmountMatches,
		],
	);

	const refreshDuplicateMatching = useCallback(async () => {
		if (!statement || rows.length === 0 || isChecking) return;

		const resolvedCardId = (() => {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			if (decoded?.type === "card") return decoded.id;

			return (
				activeInvoiceContext?.cardId ??
				selectedCardOption?.value ??
				initialCardId ??
				linkedCardId ??
				null
			);
		})();

		const resolvedAccountId = (() => {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			if (decoded?.type === "account") return decoded.id;
			return initialAccountId ?? null;
		})();

		const statementPeriod = resolveAccountStatementDateRange(statement);

		const invoicePeriodsForSnapshots = [
			...new Set(
				[
					invoicePeriod,
					activeInvoiceContext?.invoicePeriod,
					initialInvoicePeriod,
				].filter((period): period is string => Boolean(period)),
			),
		];

		const shouldFetchInvoiceSnapshots = shouldFetchInvoiceDuplicateSnapshots({
			statementIsCreditCard: statement.isCreditCard,
			resolvedCardId,
			accountCardValue,
			activeInvoiceContextCardId: activeInvoiceContext?.cardId ?? null,
			initialCardId: initialCardId ?? null,
		});
		const shouldFetchAccountSnapshots =
			!shouldFetchInvoiceSnapshots && resolvedAccountId && statementPeriod;

		if (!shouldFetchInvoiceSnapshots && !shouldFetchAccountSnapshots) {
			return;
		}

		const fitIds = rows
			.filter((row) => !isInvoiceExtraReviewRow(row))
			.map((row) => row.externalId)
			.filter((id): id is string => id !== null);

		try {
			const [
				duplicates,
				duplicateSnapshots,
				invoicePeriodSnapshotGroups,
				cardInstallmentSnapshots,
				accountImportSnapshots,
			] = await Promise.all([
				checkDuplicateFitIds(fitIds).then((ids) => new Set(ids)),
				fetchImportDuplicateSnapshots(fitIds),
				shouldFetchInvoiceSnapshots && resolvedCardId
					? Promise.all(
							invoicePeriodsForSnapshots.map((period) =>
								fetchInvoicePeriodDuplicateSnapshots(resolvedCardId, period),
							),
						)
					: Promise.resolve([]),
				shouldFetchInvoiceSnapshots && resolvedCardId
					? fetchCardInstallmentDuplicateSnapshots(resolvedCardId)
					: Promise.resolve([]),
				shouldFetchAccountSnapshots
					? fetchAccountImportDuplicateSnapshots(
							resolvedAccountId,
							statementPeriod.from,
							statementPeriod.to,
						)
					: Promise.resolve([]),
			]);

			const invoicePeriodSnapshots = mergeImportDuplicateSnapshots(
				...invoicePeriodSnapshotGroups,
			);

			setInvoicePeriodExistingSnapshots(
				pickInvoicePeriodExistingSnapshots(
					invoicePeriodsForSnapshots,
					invoicePeriodSnapshotGroups,
					invoicePeriod ?? invoicePeriodsForSnapshots[0] ?? null,
				),
			);

			const duplicateSnapshotByFitId =
				buildDuplicateSnapshotByFitId(duplicateSnapshots);

			const semanticCandidates = shouldFetchInvoiceSnapshots
				? mergeImportDuplicateSnapshots(
						invoicePeriodSnapshots,
						cardInstallmentSnapshots,
					)
				: accountImportSnapshots;

			const transferPeerByTransactionId =
				buildTransferPeerAccountMap(semanticCandidates);

			setPeriodLockedExistingIds(
				collectPeriodLockedTransactionIds(semanticCandidates),
			);

			const duplicateStates = resolveImportDuplicateMatches(
				rows
					.filter((row) => !isInvoiceExtraReviewRow(row))
					.map((row) => ({
						date: row.date,
						amount: row.amount,
						description: row.description,
						transactionType: row.transactionType,
						installmentImport: row.installmentImport,
						externalId: row.externalId,
						linked: row.linked,
						linkedTransactionId: row.linkedTransactionId,
					})),
				{
					candidates: semanticCandidates,
					fitIdDuplicateIds: duplicates,
					duplicateSnapshotByFitId,
					options: {
						invoicePeriods: invoicePeriodsForSnapshots,
					},
				},
			);

			setRows((previousRows) => {
				const fileRows = previousRows.filter(
					(row) => !isInvoiceExtraReviewRow(row),
				);
				const updatedFileRows = fileRows.map((row, index) => {
					if (row.linked || row.reimported || row.linkedTransactionId) {
						return row;
					}

					const duplicateState = duplicateStates[index];
					if (!duplicateState) return row;

					const isLinkSuggestion =
						duplicateState.duplicateValidation?.status === "link_suggestion";
					const duplicateTransfer = inferImportRowTransferFromDuplicate(
						duplicateState.duplicateValidation,
						transferPeerByTransactionId,
					);
					let resolvedCategoryId = row.categoryId;
					let resolvedPayerId = row.payerId;

					if (isLinkSuggestion && duplicateState.duplicateValidation) {
						resolvedPayerId =
							duplicateState.duplicateValidation.existingPayerId ??
							resolvedPayerId;

						if (
							!resolvedCategoryId &&
							duplicateState.duplicateValidation.existingCategoryId &&
							isCategoryCompatible(
								duplicateState.duplicateValidation.existingCategoryId,
								row.transactionType,
							)
						) {
							resolvedCategoryId =
								duplicateState.duplicateValidation.existingCategoryId;
						}
					}

					return {
						...row,
						isDuplicate: duplicateState.isDuplicate,
						duplicateValidation: duplicateState.duplicateValidation,
						selected:
							duplicateState.isDuplicate || isLinkSuggestion
								? false
								: row.selected,
						payerId: resolvedPayerId,
						categoryId: duplicateTransfer ? null : resolvedCategoryId,
						kind: duplicateTransfer?.kind ?? row.kind,
						transferPeerAccountId:
							duplicateTransfer?.transferPeerAccountId ??
							row.transferPeerAccountId,
					};
				});

				if (!shouldFetchInvoiceSnapshots) {
					return updatedFileRows;
				}

				const periodSnapshots = pickInvoicePeriodExistingSnapshots(
					invoicePeriodsForSnapshots,
					invoicePeriodSnapshotGroups,
					invoicePeriod ?? invoicePeriodsForSnapshots[0] ?? null,
				);

				const closedRows = applyInvoiceClosingToReviewRows({
					rows: updatedFileRows,
					snapshots: periodSnapshots,
					options: { invoicePeriods: invoicePeriodsForSnapshots },
				});

				return enrichReviewRowsWithExistingAmount(
					mergeInvoiceReviewRowsWithExtras({
						fileRows: closedRows,
						snapshots: periodSnapshots,
						fileExternalIds: collectFileExternalIds(closedRows, fitIds),
						previousRows,
					}),
					buildExistingAmountSnapshotMap(periodSnapshots),
				);
			});
		} catch (error) {
			console.error("Erro ao atualizar duplicatas da importação:", error);
		}
	}, [
		accountCardValue,
		activeInvoiceContext,
		initialAccountId,
		initialCardId,
		initialInvoicePeriod,
		invoicePeriod,
		isCategoryCompatible,
		isChecking,
		linkedCardId,
		rows,
		selectedCardOption,
		statement,
	]);

	useEffect(() => {
		if (!statement || rows.length === 0 || isChecking) return;

		const resolvedCardId = (() => {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			if (decoded?.type === "card") return decoded.id;

			return (
				activeInvoiceContext?.cardId ??
				selectedCardOption?.value ??
				initialCardId ??
				linkedCardId ??
				null
			);
		})();

		const resolvedAccountId = (() => {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			if (decoded?.type === "account") return decoded.id;
			return initialAccountId ?? null;
		})();

		const invoicePeriodsForSnapshots = [
			...new Set(
				[
					invoicePeriod,
					activeInvoiceContext?.invoicePeriod,
					initialInvoicePeriod,
				].filter((period): period is string => Boolean(period)),
			),
		];

		const contextKey = [
			resolvedCardId ?? "no-card",
			resolvedAccountId ?? "no-account",
			invoicePeriodsForSnapshots.join(","),
		].join(":");

		if (duplicateMatchingContextRef.current === null) {
			duplicateMatchingContextRef.current = contextKey;
			return;
		}

		if (duplicateMatchingContextRef.current === contextKey) {
			return;
		}

		duplicateMatchingContextRef.current = contextKey;
		void refreshDuplicateMatching();
	}, [
		accountCardValue,
		activeInvoiceContext,
		initialAccountId,
		initialCardId,
		initialInvoicePeriod,
		invoicePeriod,
		isChecking,
		linkedCardId,
		refreshDuplicateMatching,
		rows.length,
		selectedCardOption,
		statement,
	]);

	const persistImportSourceToStorage = useCallback(
		async ({
			file,
			batchId,
			cardId,
			invoicePeriod: batchInvoicePeriod,
			accountId,
			existingBatchId,
		}: {
			file: File;
			batchId: string;
			cardId: string | null;
			invoicePeriod: string | null;
			accountId: string | null;
			existingBatchId?: string | null;
		}) => {
			if (
				existingBatchId &&
				importSourceStored &&
				uploadImportBatchId === batchId
			) {
				if (batchInvoicePeriod) {
					await syncImportBatchContextAction({
						batchId,
						invoicePeriod: batchInvoicePeriod,
						cardId,
						accountId,
					});
				}
				return { success: true as const };
			}

			const uploadResult = await uploadImportSourceFile({
				file,
				importBatchId: batchId,
				importedCount: 0,
				skippedCount: 0,
				cardId,
				invoicePeriod: batchInvoicePeriod,
				accountId,
			});

			if (uploadResult.success) {
				setImportSourceStored(true);
			} else {
				toast.warning(
					uploadResult.error ??
						"O arquivo não foi salvo no storage para retomada posterior.",
				);
			}

			return uploadResult;
		},
		[importSourceStored, uploadImportBatchId],
	);

	const handleParsed = useCallback(
		async (
			stmt: ImportStatement,
			file: File,
			options?: {
				existingBatchId?: string;
				draftData?: ImportBatchDraftData | null;
			},
		) => {
			setFileError(null);
			setSourceFile(file);

			try {
				const fallbackInvoicePeriod =
					invoicePeriod ??
					activeInvoiceContext?.invoicePeriod ??
					initialInvoicePeriod ??
					null;

				const validation = validateInvoiceImportContext(
					stmt,
					activeInvoiceContext,
					cardOptions,
				);

				if (!validation.success) {
					if (validation.reason === "period_mismatch") {
						const decodedForBatch = accountCardValue
							? decodeAccountCard(accountCardValue)
							: null;
						const batchCardId =
							decodedForBatch?.type === "card"
								? decodedForBatch.id
								: (initialCardId ?? null);
						const batchAccountId =
							decodedForBatch?.type === "account" ? decodedForBatch.id : null;
						const batchInvoicePeriod = resolveUploadInvoicePeriodFromStatement(
							stmt,
							{
								selectedCardOption,
								fallbackPeriod: fallbackInvoicePeriod,
								filePeriodOverride: validation.filePeriod,
							},
						);

						let batchId = options?.existingBatchId ?? null;
						if (!batchId) {
							const registerResult = await registerImportUploadAction({
								sourceFileName: file.name,
								sourceFileSize: file.size,
								cardId: batchCardId,
								invoicePeriod: batchInvoicePeriod,
								accountId: batchAccountId,
								...getRegisterSourceTotalPayload(stmt),
							});
							if (registerResult.success) {
								batchId = registerResult.importBatchId;
							}
						}

						if (batchId) {
							setUploadImportBatchId(batchId);
							await persistImportSourceToStorage({
								file,
								batchId,
								cardId: batchCardId,
								invoicePeriod: batchInvoicePeriod,
								accountId: batchAccountId,
								existingBatchId: options?.existingBatchId,
							});
							void refreshImportHistory();
						}

						setPeriodMismatch({
							statement: stmt,
							filePeriod: validation.filePeriod,
							expectedPeriod: validation.expectedPeriod,
							cardName: validation.cardName,
						});
						return;
					}

					setFileError(validation.error);
					toast.error(validation.error);
					return;
				}

				const decoded = accountCardValue
					? decodeAccountCard(accountCardValue)
					: null;
				const uploadCardId =
					decoded?.type === "card" ? decoded.id : (initialCardId ?? null);
				const uploadAccountId = decoded?.type === "account" ? decoded.id : null;
				const uploadInvoicePeriod = resolveUploadInvoicePeriodFromStatement(
					stmt,
					{
						selectedCardOption,
						fallbackPeriod: fallbackInvoicePeriod,
					},
				);

				let draftData = options?.draftData ?? null;
				if (!draftData && options?.existingBatchId) {
					const draftResult = await getImportBatchDraftAction({
						batchId: options.existingBatchId,
					});
					if (draftResult.success) {
						draftData = draftResult.draftData;
					}
				}

				let batchId = options?.existingBatchId ?? null;
				const reusedBatch = batchId
					? importHistory.find((entry) => entry.id === batchId)
					: null;

				if (!batchId) {
					const registerResult = await registerImportUploadAction({
						sourceFileName: file.name,
						sourceFileSize: file.size,
						cardId: uploadCardId,
						invoicePeriod: uploadInvoicePeriod,
						accountId: uploadAccountId,
						...getRegisterSourceTotalPayload(stmt),
					});

					if (!registerResult.success) {
						toast.warning(
							registerResult.error ??
								"Não foi possível registrar o upload no histórico.",
						);
					} else {
						batchId = registerResult.importBatchId;
					}
				}

				if (batchId) {
					setUploadImportBatchId(batchId);

					const sourceTotalPayload = getRegisterSourceTotalPayload(stmt);
					if (
						sourceTotalPayload.sourceInvoiceTotal != null ||
						(sourceTotalPayload.sourceFileRows?.length ?? 0) > 0
					) {
						await syncImportBatchSourceTotalAction({
							batchId,
							sourceInvoiceTotal: sourceTotalPayload.sourceInvoiceTotal ?? null,
							sourceInvoiceTotalKind:
								sourceTotalPayload.sourceInvoiceTotalKind ?? null,
							sourceFileRows: sourceTotalPayload.sourceFileRows,
						});
					}

					const shouldUploadFile =
						!options?.existingBatchId || !reusedBatch?.hasAttachment;

					if (shouldUploadFile) {
						await persistImportSourceToStorage({
							file,
							batchId,
							cardId: uploadCardId,
							invoicePeriod: uploadInvoicePeriod,
							accountId: uploadAccountId,
							existingBatchId: options?.existingBatchId,
						});
					}

					void refreshImportHistory();
				}

				await processParsedStatement(stmt, {
					draftData,
				});
			} catch (error) {
				console.error("Erro ao processar arquivo importado:", error);
				const message =
					error instanceof Error && error.message
						? error.message
						: "Não foi possível processar o arquivo importado.";
				setFileError(message);
				toast.error(message);
			}
		},
		[
			activeInvoiceContext,
			accountCardValue,
			cardOptions,
			initialCardId,
			initialInvoicePeriod,
			invoicePeriod,
			importHistory,
			persistImportSourceToStorage,
			processParsedStatement,
			refreshImportHistory,
			selectedCardOption,
		],
	);

	const resumeImportBatch = useCallback(
		async (batchId: string) => {
			if (resumingBatchId === batchId) return;

			setFileError(null);
			setIsChecking(true);
			setImportProgress("fetching");
			setResumingBatchId(batchId);
			setAwaitingResumeBatch(null);

			try {
				const result = await getImportBatchResumeAction({ batchId });

				if (!result.success) {
					toast.error(result.error);
					resumeAttemptedRef.current = false;
					return;
				}

				let file: File | null = null;

				if (result.fileContentBase64 && result.mimeType) {
					file = fileFromBase64(
						result.fileContentBase64,
						result.sourceFileName,
						result.mimeType,
					);
				} else if (result.downloadUrl) {
					const response = await fetch(result.downloadUrl);
					if (response.ok) {
						const blob = await response.blob();
						file = new File([blob], result.sourceFileName, {
							type: blob.type || result.mimeType || "application/octet-stream",
						});
					}
				}

				if (!file) {
					setUploadImportBatchId(batchId);
					setImportSourceStored(false);
					setAwaitingResumeBatch({
						batchId,
						sourceFileName: result.sourceFileName,
						draftData: result.draftData,
					});
					if (result.draftData) {
						toast.message(
							"Selecione o mesmo arquivo abaixo para restaurar o rascunho.",
						);
					} else {
						toast.error(
							"Arquivo não encontrado no servidor. Envie o PDF novamente.",
						);
					}
					return;
				}

				setImportSourceStored(true);

				setImportProgress("parsing");
				const statement = await parseImportFileClient(file, {
					cardId: linkedCardId,
					pdfPasswordCandidates:
						autoPdfPasswordAttempts.length > 0
							? autoPdfPasswordAttempts
							: undefined,
				});

				if (statement.transactions.length === 0) {
					toast.error("Nenhuma transação encontrada no arquivo.");
					resumeAttemptedRef.current = false;
					return;
				}

				await handleParsed(statement, file, {
					existingBatchId: batchId,
					draftData: result.draftData,
				});

				if (result.draftData) {
					toast.success("Progresso da importação restaurado.");
				}
			} catch (error) {
				resumeAttemptedRef.current = false;
				if (error instanceof Error && error.message) {
					toast.error(error.message);
				} else {
					toast.error(
						mapPdfLoadError(error, autoPdfPasswordAttempts.length > 0).message,
					);
				}
			} finally {
				setIsChecking(false);
				setImportProgress(null);
				setResumingBatchId(null);
			}
		},
		[autoPdfPasswordAttempts, handleParsed, linkedCardId, resumingBatchId],
	);

	const handleUploadParsed = useCallback(
		async (
			stmt: ImportStatement,
			file: File,
			options?: {
				existingBatchId?: string;
			},
		) => {
			const existingBatchId =
				options?.existingBatchId ?? awaitingResumeBatch?.batchId;
			const draftData = awaitingResumeBatch?.draftData ?? null;

			if (awaitingResumeBatch) {
				setAwaitingResumeBatch(null);
			}

			await handleParsed(stmt, file, {
				existingBatchId,
				draftData,
			});
		},
		[awaitingResumeBatch, handleParsed],
	);

	useEffect(() => {
		if (!batchIdToResume || resumeAttemptedRef.current || statement) return;

		resumeAttemptedRef.current = true;
		void resumeImportBatch(batchIdToResume);
	}, [batchIdToResume, resumeImportBatch, statement]);

	const handleConfirmPeriodMismatch = useCallback(async () => {
		if (!periodMismatch || !activeInvoiceContext) return;

		const { statement, filePeriod } = periodMismatch;

		setActiveInvoiceContext({
			...activeInvoiceContext,
			invoicePeriod: filePeriod,
		});
		setInvoicePeriod(filePeriod);
		setPeriodMismatch(null);

		if (!uploadImportBatchId && sourceFile) {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			const registerResult = await registerImportUploadAction({
				sourceFileName: sourceFile.name,
				sourceFileSize: sourceFile.size,
				cardId: decoded?.type === "card" ? decoded.id : (initialCardId ?? null),
				invoicePeriod: filePeriod,
				accountId: decoded?.type === "account" ? decoded.id : null,
				...getRegisterSourceTotalPayload(statement),
			});

			if (registerResult.success) {
				setUploadImportBatchId(registerResult.importBatchId);
				await persistImportSourceToStorage({
					file: sourceFile,
					batchId: registerResult.importBatchId,
					cardId:
						decoded?.type === "card" ? decoded.id : (initialCardId ?? null),
					invoicePeriod: filePeriod,
					accountId: decoded?.type === "account" ? decoded.id : null,
				});
				void refreshImportHistory();
			}
		} else if (uploadImportBatchId && sourceFile) {
			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			const existingBatch = importHistory.find(
				(entry) => entry.id === uploadImportBatchId,
			);

			if (!existingBatch?.hasAttachment) {
				await persistImportSourceToStorage({
					file: sourceFile,
					batchId: uploadImportBatchId,
					cardId:
						decoded?.type === "card" ? decoded.id : (initialCardId ?? null),
					invoicePeriod: filePeriod,
					accountId: decoded?.type === "account" ? decoded.id : null,
					existingBatchId: uploadImportBatchId,
				});
				void refreshImportHistory();
			} else {
				await syncImportBatchContextAction({
					batchId: uploadImportBatchId,
					invoicePeriod: filePeriod,
					cardId:
						decoded?.type === "card" ? decoded.id : (initialCardId ?? null),
					accountId: decoded?.type === "account" ? decoded.id : null,
				});
			}
		}

		await processParsedStatement(statement);
	}, [
		activeInvoiceContext,
		accountCardValue,
		importHistory,
		initialCardId,
		periodMismatch,
		persistImportSourceToStorage,
		processParsedStatement,
		refreshImportHistory,
		sourceFile,
		uploadImportBatchId,
	]);

	useEffect(() => {
		if (!statement?.isCreditCard) return;
		applyStatementInvoicePeriod(statement);
	}, [statement, applyStatementInvoicePeriod, selectedCardOption]);

	useEffect(() => {
		if (paymentAccountId || !initialPaymentAccountId) return;
		setPaymentAccountId(initialPaymentAccountId);
	}, [initialPaymentAccountId, paymentAccountId]);

	// Pré-seleciona cartão ou conta conforme o arquivo — inclusive quando a rota
	// já veio com cartão na URL e o usuário enviou um extrato de conta.
	useEffect(() => {
		if (!statement) return;

		if (statement.isCreditCard) {
			if (accountCardValue?.startsWith("card:")) return;
			if (cardOptions[0]) {
				setAccountCardValue(encodeAccountCard("card", cardOptions[0].value));
			}
			return;
		}

		if (accountCardValue?.startsWith("account:")) return;

		const accountId = initialAccountId ?? accountOptions[0]?.value ?? null;
		if (accountId) {
			setAccountCardValue(encodeAccountCard("account", accountId));
		}
	}, [
		statement,
		cardOptions,
		accountOptions,
		accountCardValue,
		initialAccountId,
	]);

	const toggleRow = (index: number) => {
		setRows((prev) =>
			prev.map((r, i) => {
				if (
					i !== index ||
					isImportRowResolved(r) ||
					isImportLinkSuggestion(r)
				) {
					return r;
				}
				return { ...r, selected: !r.selected };
			}),
		);
	};

	const toggleAll = (selected: boolean) => {
		setRows((prev) =>
			prev.map((r) => {
				if (isImportRowResolved(r) || isImportLinkSuggestion(r)) {
					return { ...r, selected: false };
				}
				if (
					selected &&
					shouldExcludeInvoicePaymentFromCardImport({
						description: r.description,
						isCreditCardStatement: Boolean(statement?.isCreditCard),
					})
				) {
					return { ...r, selected: false };
				}
				return { ...r, selected };
			}),
		);
	};

	const toggleAllFiltered = (indices: number[], selected: boolean) => {
		const indexSet = new Set(indices);
		setRows((prev) =>
			prev.map((r, i) => {
				if (isImportRowResolved(r) || isImportLinkSuggestion(r)) {
					return { ...r, selected: false };
				}
				if (indexSet.has(i)) {
					if (
						selected &&
						shouldExcludeInvoicePaymentFromCardImport({
							description: r.description,
							isCreditCardStatement: Boolean(statement?.isCreditCard),
						})
					) {
						return { ...r, selected: false };
					}
					return { ...r, selected };
				}
				return r;
			}),
		);
	};

	const handleCategoryChange = useCallback(
		async (index: number, categoryId: string | null) => {
			const row = rows[index];
			if (!row || row.kind !== "transaction") return;
			if (!isCategoryCompatible(categoryId, row.transactionType)) return;

			const existingTransactionId =
				row.linkedTransactionId ??
				row.duplicateValidation?.existingTransactionId;
			const shouldPersistExistingCategory =
				Boolean(existingTransactionId) &&
				(isImportRowLinked(row) || isVerifiedImportDuplicate(row));

			if (shouldPersistExistingCategory && existingTransactionId) {
				const result = await updateImportExistingTransactionCategoryAction({
					transactionId: existingTransactionId,
					categoryId,
				});
				if (!result.success) {
					toast.error(result.error);
					return;
				}
			}

			setRows((prev) =>
				prev.map((r, i) =>
					i === index &&
					r.kind === "transaction" &&
					isCategoryCompatible(categoryId, r.transactionType)
						? { ...r, categoryId }
						: r,
				),
			);
		},
		[rows, isCategoryCompatible],
	);

	const handleRowTypeChange = (
		index: number,
		type: "expense" | "income" | "invoice_payment" | "transfer",
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;

				if (type === "invoice_payment") {
					const cardId =
						row.invoicePaymentCardId ??
						guessInvoicePaymentCardId(row.description, cardOptions);

					return {
						...row,
						kind: "invoice_payment" as const,
						transactionType: "expense" as const,
						categoryId: pagamentosCategoryId,
						invoicePaymentCardId: cardId,
						invoicePaymentPeriod:
							row.invoicePaymentPeriod ??
							guessInvoicePaymentPeriod(row.date, cardOptions, cardId),
						transferPeerAccountId: null,
						installmentImport: null,
						recurrenceImport: null,
					};
				}

				if (type === "transfer") {
					return {
						...row,
						kind: "transfer" as const,
						categoryId: null,
						invoicePaymentCardId: null,
						invoicePaymentPeriod: null,
						transferPeerAccountId: row.transferPeerAccountId,
						installmentImport: null,
						recurrenceImport: null,
					};
				}

				return {
					...row,
					kind: "transaction" as const,
					transactionType: type,
					invoicePaymentCardId: null,
					invoicePaymentPeriod: null,
					transferPeerAccountId: null,
					categoryId: isCategoryCompatible(row.categoryId, type)
						? row.categoryId
						: null,
				};
			}),
		);
	};

	const handleInvoicePaymentCardChange = (
		index: number,
		cardId: string | null,
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;

				return {
					...row,
					invoicePaymentCardId: cardId,
					invoicePaymentPeriod:
						guessInvoicePaymentPeriod(row.date, cardOptions, cardId) ??
						row.invoicePaymentPeriod,
				};
			}),
		);
	};

	const handleInvoicePaymentPeriodChange = (
		index: number,
		period: string | null,
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) =>
				rowIndex === index ? { ...row, invoicePaymentPeriod: period } : row,
			),
		);
	};

	const handleTransferPeerAccountChange = (
		index: number,
		accountId: string | null,
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) =>
				rowIndex === index ? { ...row, transferPeerAccountId: accountId } : row,
			),
		);
	};

	const handleRequestCreateTransferPeerAccount = (index: number) => {
		setAccountCreateRowIndex(index);
		setAccountCreateOpen(true);
	};

	const handleTransferPeerAccountCreated = (account: CreatedAccount) => {
		setExtraAccountOptions((prev) =>
			prev.some((option) => option.value === account.id)
				? prev
				: [
						...prev,
						{
							value: account.id,
							label: account.name,
							logo: account.logo,
							accountType: account.accountType,
						},
					],
		);

		if (accountCreateRowIndex !== null) {
			handleTransferPeerAccountChange(accountCreateRowIndex, account.id);
		}

		setAccountCreateOpen(false);
		setAccountCreateRowIndex(null);
	};

	const handlePayerChange = (index: number, payerId: string | null) => {
		setRows((prev) =>
			prev.map((r, i) => (i === index ? { ...r, payerId } : r)),
		);
	};

	const handleUndoDuplicate = async (index: number) => {
		const row = rows[index];
		if (!row) return;

		const existingTransactionId =
			row.duplicateValidation?.existingTransactionId;
		const result = existingTransactionId
			? await deleteImportDuplicateTransaction(existingTransactionId)
			: row.externalId
				? await deleteTransactionByFitId(row.externalId)
				: { success: false as const };

		if (!result.success) {
			toast.error("Não foi possível desfazer a importação anterior.");
			return;
		}

		setInvoicePeriodExistingSnapshots((prev) =>
			dropExistingSnapshotAfterDelete(prev, {
				transactionId: existingTransactionId,
				externalId: row.externalId,
			}),
		);
		setRows((prev) =>
			prev.map((r, i) =>
				i === index
					? {
							...r,
							isDuplicate: false,
							selected: true,
							reimported: true,
							duplicateValidation: null,
						}
					: r,
			),
		);
		toast.success("Importação anterior removida.");
	};

	const handleEditDuplicate = useCallback(
		async (index: number) => {
			const row = rows[index];
			const transactionId = row?.duplicateValidation?.existingTransactionId;
			if (!transactionId) return;

			const [transaction, options] = await Promise.all([
				fetchTransactionByIdClient(transactionId),
				editDialogOptions ?? fetchTransactionDialogOptionsClient(),
			]);

			if (!transaction) {
				toast.error("Lançamento não encontrado.");
				return;
			}

			if (!editDialogOptions) {
				setEditDialogOptions(options);
			}

			setEditTransaction(transaction);
			setEditDialogOpen(true);
		},
		[rows, editDialogOptions],
	);

	const handleEditDuplicateSuccess = useCallback(async () => {
		setEditDialogOpen(false);
		setEditTransaction(null);

		if (statement) {
			await processParsedStatement(statement);
		}
	}, [statement, processParsedStatement]);

	const handleMoveToInvoicePeriod = useCallback(
		async (index: number) => {
			const row = rows[index];
			if (!row) return;
			if (!invoicePeriod) {
				toast.error("Defina o período da fatura antes de mover o lançamento.");
				return;
			}

			const transactionId =
				row.linkedTransactionId ??
				row.duplicateValidation?.existingTransactionId ??
				row.existingTransactionId;
			if (!transactionId) {
				toast.error("Lançamento existente não identificado.");
				return;
			}

			const result = await moveImportTransactionToPeriodAction({
				transactionId,
				period: invoicePeriod,
			});
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível mover o lançamento.");
				return;
			}

			toast.success("Lançamento movido para esta fatura.");
			if (statement) {
				await processParsedStatement(statement);
			}
		},
		[rows, invoicePeriod, statement, processParsedStatement],
	);

	const handleOpenLinkDuplicate = useCallback((index: number) => {
		setLinkDialogIndex(index);
	}, []);

	const linkImportSuggestionsAtIndexes = useCallback(
		async (
			indexes: number[],
			options?: {
				mergeDescription?: ImportLinkMergeMode;
				silent?: boolean;
			},
		): Promise<number> => {
			if (indexes.length === 0) return 0;

			const linkEntries = indexes.flatMap((index) => {
				const row = rows[index];
				const validation = row?.duplicateValidation;
				if (!row || !validation || validation.status !== "link_suggestion") {
					return [];
				}

				const resolvedPayerId =
					validation.existingPayerId ??
					row.payerId ??
					payerId ??
					defaultPayerId;
				const mergeDescription =
					options?.mergeDescription ??
					resolveAutoLinkMergeDescription(validation);

				return [
					{
						index,
						request: buildImportLinkRequest({
							row,
							validation,
							mergeDescription,
							fallbackPayerId: resolvedPayerId,
						}),
						resolvedPayerId,
						validation,
					},
				];
			});

			if (linkEntries.length === 0) return 0;

			setIsLinking(true);
			try {
				const result = await linkImportSuggestionsBatchAction({
					links: linkEntries.map((entry) => entry.request),
				});

				if (!result.success) {
					toast.error(
						result.linkedCount > 0
							? `${result.linkedCount} vinculado(s), mas a operação parou: ${result.error}`
							: result.error,
					);
					if (result.linkedCount === 0) return 0;
				}

				const linkedEntries = linkEntries.slice(0, result.linkedCount);
				const linkedIndexSet = new Set(
					linkedEntries.map((entry) => entry.index),
				);

				setRows((prev) =>
					prev.map((currentRow, rowIndex) => {
						if (!linkedIndexSet.has(rowIndex)) return currentRow;

						const entry = linkedEntries.find(
							(linkedEntry) => linkedEntry.index === rowIndex,
						);
						if (!entry) return currentRow;

						return resolveLinkedReviewRowState({
							row: currentRow,
							validation: entry.validation,
							resolvedPayerId: entry.resolvedPayerId,
							isCategoryCompatible,
						});
					}),
				);

				if (!options?.silent) {
					toast.success(
						result.linkedCount === 1
							? "Lançamento vinculado ao cadastro existente."
							: `${result.linkedCount} lançamentos vinculados ao cadastro existente.`,
					);
				}

				return result.linkedCount;
			} finally {
				setIsLinking(false);
			}
		},
		[rows, payerId, defaultPayerId, isCategoryCompatible],
	);

	const handleLinkAllSuggestions = useCallback(() => {
		const indexes = collectImportLinkSuggestionIndexes(rows);
		void linkImportSuggestionsAtIndexes(indexes);
	}, [rows, linkImportSuggestionsAtIndexes]);

	useEffect(() => {
		autoLinkSignatureRef.current = null;
	}, [statement]);

	useEffect(() => {
		if (isChecking || isLinking || linkDialogIndex !== null) return;

		const autoLinkableIndexes = collectImportLinkSuggestionIndexes(rows, {
			autoLinkOnly: true,
		});
		if (autoLinkableIndexes.length === 0) return;

		const signature = autoLinkableIndexes.join(",");
		if (autoLinkSignatureRef.current === signature) return;
		autoLinkSignatureRef.current = signature;

		void linkImportSuggestionsAtIndexes(autoLinkableIndexes, {
			silent: true,
		}).then((linkedCount) => {
			if (linkedCount > 0) {
				toast.success(
					linkedCount === 1
						? "1 possível vínculo confirmado automaticamente."
						: `${linkedCount} possíveis vínculos confirmados automaticamente.`,
				);
			}
		});
	}, [
		rows,
		isChecking,
		isLinking,
		linkDialogIndex,
		linkImportSuggestionsAtIndexes,
	]);

	const handleDismissLinkSuggestion = useCallback((index: number) => {
		setRows((prev) =>
			prev.map((row, rowIndex) =>
				rowIndex === index
					? { ...row, duplicateValidation: null, selected: true }
					: row,
			),
		);
	}, []);

	const handleConfirmLinkDuplicate = useCallback(
		async (mergeDescription: ImportLinkMergeMode) => {
			if (linkDialogIndex === null) return;

			const linkedCount = await linkImportSuggestionsAtIndexes(
				[linkDialogIndex],
				{ mergeDescription },
			);
			if (linkedCount > 0) {
				setLinkDialogIndex(null);
			}
		},
		[linkDialogIndex, linkImportSuggestionsAtIndexes],
	);

	const handleDescriptionChange = (index: number, description: string) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;

				const detectedInstallment = buildReviewInstallmentImport(description);

				return {
					...row,
					description,
					installmentImport: detectedInstallment ?? row.installmentImport,
				};
			}),
		);
	};

	const handleAmountChange = (index: number, amount: number) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;

				const transactionId = resolveExistingTransactionIdForAmountEdit(row);
				if (transactionId) {
					const existingAmount = row.existingAmount ?? null;
					const equalsExisting =
						existingAmount != null &&
						Math.abs(amount - existingAmount) < 0.0001;
					return {
						...row,
						existingAmountCorrection: equalsExisting
							? null
							: { transactionId, amount },
					};
				}

				return { ...row, amount: Math.max(0, Math.round(amount * 100) / 100) };
			}),
		);
	};

	const handleInstallmentToggle = (index: number, enabled: boolean) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index || !row.installmentImport) return row;

				return {
					...row,
					installmentImport: {
						...row.installmentImport,
						enabled,
					},
				};
			}),
		);
	};

	const handleInstallmentDismiss = (index: number) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;
				if (!row.installmentImport || row.installmentImport.enabled) return row;

				return {
					...row,
					installmentImport: null,
				};
			}),
		);
	};

	const handleInstallmentCountChange = (
		index: number,
		installmentCount: number,
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index || !row.installmentImport) return row;

				const nextCount = Math.min(60, Math.max(2, installmentCount));
				const nextCurrent = Math.min(
					row.installmentImport.currentInstallment,
					nextCount,
				);

				return {
					...row,
					installmentImport: {
						...row.installmentImport,
						installmentCount: nextCount,
						currentInstallment: nextCurrent,
					},
				};
			}),
		);
	};

	const handleInstallmentCurrentChange = (
		index: number,
		currentInstallment: number,
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index || !row.installmentImport) return row;

				const nextCurrent = Math.min(
					Math.max(1, currentInstallment),
					row.installmentImport.installmentCount,
				);

				return {
					...row,
					installmentImport: {
						...row.installmentImport,
						currentInstallment: nextCurrent,
					},
				};
			}),
		);
	};

	const handleConvertToInstallment = (index: number) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;

				return {
					...row,
					recurrenceImport: null,
					installmentImport: createManualInstallmentImport(row.description),
				};
			}),
		);
	};

	const handleConvertToRecurrence = (index: number) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index) return row;

				return {
					...row,
					installmentImport: null,
					recurrenceImport: createManualRecurrenceImport(),
				};
			}),
		);
	};

	const handleRecurrenceToggle = (index: number, enabled: boolean) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index || !row.recurrenceImport) return row;

				return {
					...row,
					recurrenceImport: {
						...row.recurrenceImport,
						enabled,
					},
				};
			}),
		);
	};

	const handleRecurrenceCountChange = (
		index: number,
		recurrenceCount: number,
	) => {
		setRows((prev) =>
			prev.map((row, rowIndex) => {
				if (rowIndex !== index || !row.recurrenceImport) return row;

				return {
					...row,
					recurrenceImport: {
						...row.recurrenceImport,
						recurrenceCount: Math.min(60, Math.max(2, recurrenceCount)),
					},
				};
			}),
		);
	};

	const handleBulkCategoryChange = (categoryId: string) => {
		setRows((prev) =>
			prev.map((r) =>
				r.selected &&
				r.kind === "transaction" &&
				isCategoryCompatible(categoryId, r.transactionType)
					? { ...r, categoryId }
					: r,
			),
		);
	};

	const handleBulkPayerChange = (nextPayerId: string | null) => {
		setPayerId(nextPayerId);
		setRows((prev) =>
			prev.map((r) => (r.selected ? { ...r, payerId: nextPayerId } : r)),
		);
	};

	const handleRequestCreateCategory = (index: number) => {
		setCategoryCreateRowIndex(index);
		setCategoryCreateBulk(false);
		setCategoryCreateOpen(true);
	};

	const handleRequestBulkCreateCategory = () => {
		setCategoryCreateRowIndex(null);
		setCategoryCreateBulk(true);
		setCategoryCreateOpen(true);
	};

	const handleCategoryCreated = (category: CreatedCategory) => {
		const parentOption = mergedCategoryOptions.find(
			(option) => option.value === category.parentId,
		);
		const categoryPath = parentOption
			? `${parentOption.categoryPath ?? parentOption.label} › ${category.name}`
			: category.name;
		const categoryDepth = (parentOption?.categoryDepth ?? -1) + 1;

		setExtraCategoryOptions((prev) =>
			prev.some((option) => option.value === category.id)
				? prev
				: [
						...prev,
						{
							value: category.id,
							label: category.name,
							group: category.type,
							icon: category.icon,
							parentId: category.parentId,
							categoryPath,
							categoryDepth,
						},
					],
		);

		const matchesTransactionType = (
			transactionType: ReviewRow["transactionType"],
		) => category.type === categoryGroupByTransactionType[transactionType];

		if (categoryCreateBulk) {
			setRows((prev) =>
				prev.map((row) =>
					row.selected &&
					row.kind === "transaction" &&
					matchesTransactionType(row.transactionType)
						? { ...row, categoryId: category.id }
						: row,
				),
			);
		} else if (categoryCreateRowIndex !== null) {
			setRows((prev) =>
				prev.map((row, index) =>
					index === categoryCreateRowIndex && row.kind === "transaction"
						? { ...row, categoryId: category.id }
						: row,
				),
			);
		}

		setCategoryCreateOpen(false);
		setCategoryCreateRowIndex(null);
		setCategoryCreateBulk(false);
	};

	const categoryCreateDefaultType: CategoryType =
		categoryCreateRowIndex !== null &&
		rows[categoryCreateRowIndex]?.transactionType === "income"
			? "receita"
			: "despesa";

	const isCard = accountCardValue?.startsWith("card:") ?? false;
	const importAccountId = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		return decoded?.type === "account"
			? decoded.id
			: (initialAccountId ?? null);
	}, [accountCardValue, initialAccountId]);

	const transferAccountOptions = useMemo(() => {
		const mergedAccounts = mergeSelectOptions(
			accountOptions,
			extraAccountOptions,
		);
		return importAccountId
			? mergedAccounts.filter((option) => option.value !== importAccountId)
			: mergedAccounts;
	}, [accountOptions, extraAccountOptions, importAccountId]);

	const {
		selectedRows,
		duplicateCount,
		duplicateVerifiedCount,
		duplicateMismatchCount,
		linkSuggestionCount,
		uncategorizedCount,
		withoutPayerCount,
		unresolvedInvoicePayments,
		unresolvedTransfers,
		hasInvoicePayments,
	} = useMemo(() => {
		const selected = rows.filter(
			(
				row,
			): row is ReviewRow & {
				kind: "transaction" | "invoice_payment" | "transfer";
			} => row.selected && isImportReviewRowImportable(row),
		);
		const duplicateRows = rows.filter(
			(row) => row.isDuplicate && !isInvoiceExtraReviewRow(row),
		);
		return {
			selectedRows: selected,
			duplicateCount: duplicateRows.length,
			duplicateVerifiedCount: duplicateRows.filter(
				(r) => r.duplicateValidation?.status === "match",
			).length,
			duplicateMismatchCount: duplicateRows.filter(
				(r) => r.duplicateValidation?.status === "mismatch",
			).length,
			linkSuggestionCount: rows.filter(isImportLinkSuggestion).length,
			uncategorizedCount: selected.filter(
				(r) => r.kind === "transaction" && !r.categoryId,
			).length,
			withoutPayerCount: selected.filter((r) => !r.payerId).length,
			unresolvedInvoicePayments: selected.filter(
				(r) =>
					r.kind === "invoice_payment" &&
					(!r.invoicePaymentCardId || !r.invoicePaymentPeriod),
			).length,
			unresolvedTransfers: selected.filter(
				(r) => r.kind === "transfer" && !r.transferPeerAccountId,
			).length,
			hasInvoicePayments: selected.some((r) => r.kind === "invoice_payment"),
		};
	}, [rows]);

	const invalidInstallmentCount = selectedRows.filter(
		(row) =>
			row.installmentImport?.enabled &&
			!isValidInstallmentImport(row.installmentImport),
	).length;

	const invalidRecurrenceCount = selectedRows.filter(
		(row) =>
			row.recurrenceImport?.enabled &&
			!isValidRecurrenceImport(row.recurrenceImport),
	).length;

	const rowsMarkedForRemoval = useMemo(
		() => collectInvoiceExtraRemovalTransactionIds(rows),
		[rows],
	);

	const importRecordCount = countImportRecords(selectedRows);
	const importableRows = rows.filter(
		(row) => !isImportRowResolved(row) && !isImportLinkSuggestion(row),
	);
	const importSummary = useMemo(() => {
		const verifiedCount = rows.filter(isVerifiedImportDuplicate).length;
		const linkedCount = rows.filter((row) => row.linked).length;
		const excludedCount = rows.filter(
			(row) =>
				!row.selected &&
				isImportReviewRowImportable(row) &&
				!isInvoiceExtraReviewRow(row),
		).length;
		const removalCount = rows.filter(
			(row) => isInvoiceExtraReviewRow(row) && row.selected,
		).length;
		const replacedCount = selectedRows.filter((row) => row.reimported).length;
		const installmentBackfillCount = selectedRows.reduce((total, row) => {
			if (!isValidInstallmentImport(row.installmentImport)) return total;
			return total + (row.installmentImport.currentInstallment - 1);
		}, 0);

		return {
			verifiedCount,
			linkedCount,
			excludedCount,
			removalCount,
			replacedCount,
			installmentBackfillCount,
		};
	}, [rows, selectedRows]);

	/**
	 * Fatura anterior, para apurar como ela foi paga.
	 *
	 * Buscada só em importação de fatura de cartão: é o arquivo desta fatura que
	 * revela quanto da anterior ficou pendente.
	 */
	const [previousInvoice, setPreviousInvoice] =
		useState<InvoiceSnapshot | null>(null);

	/**
	 * Cartão desta importação.
	 *
	 * O seletor de conta/cartão vem primeiro: é por ele que o cartão é escolhido
	 * no fluxo normal, e ignorá-lo deixava a conferência do mês anterior sem
	 * cartão — e portanto invisível — em toda importação que não chegasse com o
	 * cartão já na URL.
	 */
	const invoiceCardId = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		if (decoded?.type === "card") return decoded.id;
		return (
			linkedCardId ?? initialCardId ?? activeInvoiceContext?.cardId ?? null
		);
	}, [
		accountCardValue,
		activeInvoiceContext?.cardId,
		initialCardId,
		linkedCardId,
	]);
	const invoiceTargetPeriod =
		invoicePeriod ??
		initialInvoicePeriod ??
		activeInvoiceContext?.invoicePeriod ??
		null;

	/**
	 * Estado da fatura sendo importada.
	 *
	 * Reprocessar um arquivo já processado é o caso comum — serve para aplicar
	 * melhorias posteriores. Sem saber que a fatura já está paga, o diálogo
	 * perguntava de novo "esta fatura já foi paga?", como se nada tivesse
	 * acontecido.
	 */
	const [currentInvoice, setCurrentInvoice] = useState<InvoiceSnapshot | null>(
		null,
	);

	useEffect(() => {
		if (!invoiceCardId || !invoiceTargetPeriod) {
			setPreviousInvoice(null);
			setCurrentInvoice(null);
			return;
		}

		let cancelled = false;

		void Promise.all([
			fetchInvoiceSnapshotAction({
				cardId: invoiceCardId,
				period: addMonthsToPeriod(invoiceTargetPeriod, -1),
			}),
			fetchInvoiceSnapshotAction({
				cardId: invoiceCardId,
				period: invoiceTargetPeriod,
			}),
		]).then(([previous, current]) => {
			if (cancelled) return;
			setPreviousInvoice(previous);
			setCurrentInvoice(current);
		});

		return () => {
			cancelled = true;
		};
	}, [invoiceCardId, invoiceTargetPeriod]);

	/** Liquidação da fatura anterior, apurada pelas linhas de rotativo deste arquivo. */
	const previousInvoiceSettlement = useMemo(() => {
		if (!previousInvoice) return null;

		/**
		 * O resumo do arquivo manda quando existe.
		 *
		 * O PDF do Nubank declara a fatura anterior e quanto dela recebeu, então
		 * o carrego é a diferença entre os dois — sem depender de o parser ter
		 * emitido linha de pagamento, e sem inferir nada.
		 */
		const declaredPrevious = statement?.invoice?.previousInvoiceTotal ?? null;
		const declaredPayment =
			statement?.invoice?.previousInvoicePaymentReceived ?? null;

		/*
		 * O total da fatura anterior vem do que o BANCO declarou no arquivo dela,
		 * não do cadastro. `pago = total − carrego` é uma subtração: se o total
		 * carregar desvio de registro, o desvio sai como pagamento.
		 *
		 * Julho/2026 é o caso: rolou inteira — o carrego de agosto (R$ 2.109,50) é
		 * exatamente o total declarado de julho —, mas o cadastro estava R$ 41,90
		 * mais alto e apareceu um pagamento de R$ 41,90 que nunca houve.
		 */
		const previousTotal =
			previousInvoice.declaredTotal ?? previousInvoice.total;

		if (declaredPrevious != null && declaredPayment != null) {
			return resolvePreviousInvoiceSettlement({
				previousTotal,
				carriedOver: Math.max(0, declaredPrevious - declaredPayment),
				filePaymentsTotal: declaredPayment,
			});
		}

		return resolvePreviousInvoiceSettlement({
			previousTotal,
			carriedOver: sumInvoiceRolloverCarry(rows),
			filePaymentsTotal: sumInvoicePaymentRowsFromFile(rows),
		});
	}, [
		previousInvoice,
		rows,
		statement?.invoice?.previousInvoiceTotal,
		statement?.invoice?.previousInvoicePaymentReceived,
	]);

	const rolloverCharges = useMemo(
		() => sumInvoiceRolloverCharges(rows),
		[rows],
	);

	/**
	 * Pagamento da fatura reaberto para correção.
	 *
	 * Fatura já paga não pergunta nada por padrão. Marcando aqui, a pergunta
	 * volta — para trocar a data ou desfazer a baixa quando o registro estiver
	 * errado.
	 */
	const [invoicePaymentReopened, setInvoicePaymentReopened] = useState(false);

	// Trocar de fatura fecha a reabertura: ela vale para um pagamento só.
	useEffect(() => {
		setInvoicePaymentReopened(false);
	}, [invoiceCardId, invoiceTargetPeriod]);

	/** Correção pontual da fatura anterior, aberta pelo botão Ajustar. */
	const [fixPreviousOpen, setFixPreviousOpen] = useState(false);
	const [isFixingPrevious, startFixPrevious] = useTransition();

	/** Limites do cartão hoje, para comparar com o que a fatura declara. */
	const [cardLimits, setCardLimits] = useState<CardLimitsSnapshot | null>(null);
	const [cardLimitsConfirmed, setCardLimitsConfirmed] = useState(true);

	useEffect(() => {
		if (!invoiceCardId) {
			setCardLimits(null);
			return;
		}

		let cancelled = false;
		void fetchCardLimitsAction(invoiceCardId).then((snapshot) => {
			if (cancelled) return;
			setCardLimits(snapshot);
		});

		return () => {
			cancelled = true;
		};
	}, [invoiceCardId]);

	// Trocar de cartão invalida a confirmação anterior.
	useEffect(() => {
		setCardLimitsConfirmed(true);
	}, [invoiceCardId]);

	const fileCreditLimit = statement?.invoice?.creditLimitTotal ?? null;
	const fileGuaranteedLimit = statement?.invoice?.creditLimitGuaranteed ?? null;

	/** O que muda nos limites ao confirmar, uma linha por item. */
	const cardLimitsChangeLines = useMemo(() => {
		if (fileCreditLimit == null || !cardLimits) return [];

		const lines: string[] = [];

		if (Math.abs(fileCreditLimit - cardLimits.limit) > 0.01) {
			lines.push(
				`O limite total vai de ${formatCurrency(cardLimits.limit)} para ${formatCurrency(fileCreditLimit)}.`,
			);
		}

		const guaranteedDiffers =
			fileGuaranteedLimit != null &&
			(cardLimits.guaranteedLimit == null ||
				Math.abs(fileGuaranteedLimit - cardLimits.guaranteedLimit) > 0.01);

		if (guaranteedDiffers && fileGuaranteedLimit != null) {
			lines.push(
				cardLimits.guaranteedLimit == null
					? `O limite garantido passa a ser ${formatCurrency(fileGuaranteedLimit)}.`
					: `O limite garantido vai de ${formatCurrency(cardLimits.guaranteedLimit)} para ${formatCurrency(fileGuaranteedLimit)}.`,
			);
		}

		return lines;
	}, [cardLimits, fileCreditLimit, fileGuaranteedLimit]);

	/** Pagamentos do arquivo, distribuídos entre a fatura anterior e esta. */
	const invoicePaymentAllocation = useMemo(() => {
		if (!previousInvoiceSettlement) return null;

		return allocateInvoicePayments({
			payments: collectInvoicePaymentRowsFromFile(rows),
			paidOnPrevious: previousInvoiceSettlement.paidOnPrevious,
		});
	}, [previousInvoiceSettlement, rows]);

	/** Conferência ponto a ponto da fatura anterior. */
	const previousInvoiceReview = useMemo(() => {
		if (!previousInvoiceSettlement || !previousInvoice) return null;

		return buildPreviousInvoiceReview({
			settlement: previousInvoiceSettlement,
			registeredPreviousTotal: previousInvoice.total,
			registeredStatus: previousInvoice.paymentStatus,
			registeredPaymentAmount: previousInvoice.paymentTransactionAmount,
			registeredPaymentDate: previousInvoice.paymentTransactionDate,
			/*
			 * Data que liquidou a fatura anterior.
			 *
			 * Com vários pagamentos no mês, o mais recente pode ser amortização
			 * desta fatura — usá-lo acusava divergência onde não havia. A alocação
			 * diz qual pagamento de fato abateu a anterior. O PDF, que não traz as
			 * linhas, cai na data declarada na seção "Pagamentos".
			 */
			filePaymentDate:
				invoicePaymentAllocation?.previousSettlementDate ??
				statement?.invoice?.paymentDate ??
				findInvoicePaymentDateFromFile(rows, isInvoicePaymentDescription),
			formatMoney: formatCurrency,
			formatDate: (isoDate) => formatDateOnly(isoDate) ?? isoDate,
		});
	}, [
		invoicePaymentAllocation,
		previousInvoice,
		previousInvoiceSettlement,
		rows,
		statement?.invoice?.paymentDate,
	]);

	/**
	 * Abates desta fatura declarados no arquivo, e o que deles falta registrar.
	 *
	 * A revisão já mostrava "amortizou esta fatura" e ninguém gravava nada: o
	 * dinheiro saía da conta num mês e o extrato só mostrava a saída no
	 * vencimento do mês seguinte, num valor que nunca saiu de uma vez.
	 */
	const invoiceAmortizations = useMemo(
		() =>
			invoicePaymentAllocation
				? collectInvoiceAmortizations(invoicePaymentAllocation.payments)
				: [],
		[invoicePaymentAllocation],
	);

	const amortizationNeedsWrite = useMemo(
		() =>
			invoiceAmortizations.length > 0 &&
			invoiceAmortizationsDiffer(
				invoiceAmortizations,
				currentInvoice?.amortizations ?? [],
			),
		[invoiceAmortizations, currentInvoice?.amortizations],
	);

	const amortizationChangeLines = useMemo(() => {
		if (!amortizationNeedsWrite) return [];

		return invoiceAmortizations.map(
			(entry) =>
				`${formatCurrency(entry.amount)} pagos em ${formatDateOnly(entry.date) ?? entry.date} passam a constar como pagamento desta fatura.`,
		);
	}, [amortizationNeedsWrite, invoiceAmortizations]);

	/**
	 * Confirmação de registrar o abate.
	 *
	 * Marcada por padrão — é dinheiro que saiu da conta e não está lançado —, mas
	 * visível e recusável como as demais.
	 */
	const [amortizationConfirmed, setAmortizationConfirmed] = useState(true);

	useEffect(() => {
		setAmortizationConfirmed(true);
	}, [invoicePeriod]);

	/** O que a importação mudaria na fatura anterior, uma linha por item. */
	const previousSettlementChangeLines = useMemo(() => {
		if (
			!previousInvoiceSettlement ||
			!previousInvoice ||
			!previousInvoiceReview
		)
			return [];

		const lines: string[] = [];
		const { changes } = previousInvoiceReview;

		if (changes.status) {
			const statusLabel =
				previousInvoiceSettlement.paymentStatus ===
				INVOICE_PAYMENT_STATUS.PARTIAL
					? "paga parcialmente"
					: previousInvoiceSettlement.paymentStatus ===
							INVOICE_PAYMENT_STATUS.PAID
						? "paga"
						: "em aberto";
			lines.push(`A fatura passa a constar como ${statusLabel}.`);
		}

		if (
			changes.debitAmount &&
			previousInvoice.paymentTransactionAmount != null
		) {
			lines.push(
				`O débito na conta vai de ${formatCurrency(
					previousInvoice.paymentTransactionAmount,
				)} para ${formatCurrency(previousInvoiceSettlement.paidOnPrevious)}.`,
			);
		}

		if (changes.paymentDate && statement?.invoice?.paymentDate) {
			const novaData =
				formatDateOnly(statement.invoice.paymentDate) ??
				statement.invoice.paymentDate;
			const dataAtual = previousInvoice.paymentTransactionDate
				? (formatDateOnly(previousInvoice.paymentTransactionDate) ??
					previousInvoice.paymentTransactionDate)
				: null;
			lines.push(
				dataAtual
					? `A data do pagamento vai de ${dataAtual} para ${novaData}.`
					: `A data do pagamento passa a ser ${novaData}.`,
			);
		}

		return lines;
	}, [
		previousInvoice,
		previousInvoiceReview,
		previousInvoiceSettlement,
		statement?.invoice?.paymentDate,
	]);

	/**
	 * Confirmação de reescrever a fatura anterior.
	 *
	 * Vem marcada porque os números saem do próprio arquivo, mas fica visível e
	 * desmarcável: é mês fechado, e o usuário pode preferir ajustar à mão.
	 */
	const [previousSettlementConfirmed, setPreviousSettlementConfirmed] =
		useState(true);

	// Trocar de arquivo ou de fatura invalida a confirmação anterior.
	useEffect(() => {
		setPreviousSettlementConfirmed(true);
	}, [previousInvoice?.period]);

	const returnToInvoiceHref = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const cardId =
			decoded?.type === "card"
				? decoded.id
				: (initialCardId ??
					linkedCardId ??
					activeInvoiceContext?.cardId ??
					null);
		const period =
			invoicePeriod ??
			initialInvoicePeriod ??
			activeInvoiceContext?.invoicePeriod ??
			null;

		if (!cardId || !period) return null;
		return `/cards/${cardId}/invoice?periodo=${formatPeriodForUrl(period)}`;
	}, [
		accountCardValue,
		activeInvoiceContext?.cardId,
		activeInvoiceContext?.invoicePeriod,
		initialCardId,
		initialInvoicePeriod,
		invoicePeriod,
		linkedCardId,
	]);

	/** Cartão em jogo nesta importação, para a pergunta de pagamento da fatura. */
	const invoiceCardIdForPayment = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		return decoded?.type === "card"
			? decoded.id
			: (initialCardId ?? linkedCardId ?? activeInvoiceContext?.cardId ?? null);
	}, [
		accountCardValue,
		activeInvoiceContext?.cardId,
		initialCardId,
		linkedCardId,
	]);

	const invoicePeriodForPayment =
		invoicePeriod ??
		initialInvoicePeriod ??
		activeInvoiceContext?.invoicePeriod ??
		null;

	/** Vencimento da fatura, sugerido como data do pagamento. */
	const invoiceDueDate = useMemo(() => {
		if (!invoiceCardIdForPayment || !invoicePeriodForPayment) return null;
		const dueDay = cardDueDays[invoiceCardIdForPayment];
		if (!dueDay) return null;
		return buildDateOnlyStringFromPeriodDay(invoicePeriodForPayment, dueDay);
	}, [cardDueDays, invoiceCardIdForPayment, invoicePeriodForPayment]);

	const canAskInvoicePayment = Boolean(
		invoiceCardIdForPayment &&
			invoicePeriodForPayment &&
			statement?.isCreditCard,
	);

	/** Fatura já quitada não recebe baixa de novo, mesmo que o toggle esteja ligado. */
	const invoiceAlreadyPaid =
		currentInvoice?.paymentStatus === INVOICE_PAYMENT_STATUS.PAID;

	const shouldPayInvoiceOnImport =
		canAskInvoicePayment &&
		(!invoiceAlreadyPaid || invoicePaymentReopened) &&
		payInvoiceOnImport &&
		Boolean(paymentAccountId);

	const returnToAccountStatementHref = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const accountId =
			decoded?.type === "account" ? decoded.id : (initialAccountId ?? null);
		const period = invoicePeriod ?? initialInvoicePeriod ?? null;

		if (!accountId || !period) return null;
		return buildAccountStatementHref(accountId, period);
	}, [accountCardValue, initialAccountId, initialInvoicePeriod, invoicePeriod]);

	const returnToSourceHref =
		returnToInvoiceHref ?? returnToAccountStatementHref;

	const navigateAfterImportDraftSaved = useCallback(() => {
		resumeAttemptedRef.current = true;

		const href =
			returnToSourceHref ??
			buildImportLandingHref({
				cardId:
					initialCardId ?? linkedCardId ?? activeInvoiceContext?.cardId ?? null,
				accountId: initialAccountId,
				invoicePeriod:
					invoicePeriod ??
					initialInvoicePeriod ??
					activeInvoiceContext?.invoicePeriod ??
					null,
			});

		window.location.assign(href);
	}, [
		activeInvoiceContext?.cardId,
		activeInvoiceContext?.invoicePeriod,
		initialAccountId,
		initialCardId,
		initialInvoicePeriod,
		invoicePeriod,
		linkedCardId,
		returnToSourceHref,
	]);

	const amountCorrectionCount = useMemo(
		() => countExistingAmountEdits(rows),
		[rows],
	);

	const installmentCorrectionCount = useMemo(
		() => countExistingInstallmentEdits(rows),
		[rows],
	);

	// Fatura já conferida não tem nada a mudar, mas ainda falta registrar o
	// pagamento — sem isto o botão travava e não havia caminho para fechar o mês.
	const hasPendingImportWork =
		selectedRows.length > 0 ||
		rowsMarkedForRemoval.length > 0 ||
		amountCorrectionCount > 0 ||
		installmentCorrectionCount > 0;

	const hasAccountBalanceReconciliation = Boolean(
		statement?.accountBalances?.balances &&
			!statement.isCreditCard &&
			accountCardValue?.startsWith("account:"),
	);

	const canImport =
		(hasPendingImportWork ||
			canAskInvoicePayment ||
			hasAccountBalanceReconciliation) &&
		!!accountCardValue &&
		uncategorizedCount === 0 &&
		withoutPayerCount === 0 &&
		unresolvedInvoicePayments === 0 &&
		unresolvedTransfers === 0 &&
		invalidInstallmentCount === 0 &&
		invalidRecurrenceCount === 0 &&
		(!isCard || !!invoicePeriod) &&
		(!hasInvoicePayments || accountCardValue.startsWith("account:")) &&
		!isPending &&
		!isImporting;

	const invoiceSourceTotal = useMemo(
		() => (statement ? resolveInvoiceSourceTotal(statement) : null),
		[statement],
	);

	const invoicePeriodExistingIdSet = useMemo(
		() => buildInvoicePeriodExistingIdSet(invoicePeriodExistingSnapshots),
		[invoicePeriodExistingSnapshots],
	);

	const crossPeriodReviewStats = useMemo(
		() => collectCrossPeriodReviewStats(rows, invoicePeriodExistingIdSet),
		[rows, invoicePeriodExistingIdSet],
	);

	const invoiceExtraReviewStats = useMemo(() => {
		const extraRows = rows.filter(isInvoiceExtraReviewRow);
		return {
			count: extraRows.length,
			markedForRemovalCount: extraRows.filter((row) => row.selected).length,
		};
	}, [rows]);

	const importInvoiceReconciliation = useMemo(() => {
		if (!statement?.isCreditCard || !invoiceSourceTotal) return null;

		const existingRows = invoicePeriodExistingSnapshots.map(
			mapDuplicateSnapshotToExistingRow,
		);
		const existingAmountEdits = collectExistingAmountEdits(rows);

		return computeImportReconciliation({
			sourceTotal: invoiceSourceTotal.amount,
			reviewRows: rows.map(mapReviewRowToReconciliationRow),
			existingRows: applyExistingAmountEdits(existingRows, existingAmountEdits),
			fileExternalIds: collectFileExternalIds(
				rows,
				statement.transactions
					.map((transaction) => transaction.externalId)
					.filter((id): id is string => Boolean(id)),
			),
		});
	}, [statement, rows, invoicePeriodExistingSnapshots, invoiceSourceTotal]);

	const selectedFinanceCharges = useMemo(() => {
		const declaredTotal = statement?.invoice?.financeChargesTotal;
		if (declaredTotal == null || declaredTotal <= 0) return null;

		const selectedTotal = rows
			.filter(
				(row) => row.selected && /^encargos\b/i.test(row.description.trim()),
			)
			.reduce((sum, row) => sum + row.amount, 0);

		return selectedTotal > 0 ? selectedTotal : 0;
	}, [rows, statement?.invoice?.financeChargesTotal]);

	const invoiceTotalBalanced =
		!importInvoiceReconciliation ||
		isInvoiceTotalReconciled(importInvoiceReconciliation.delta);

	const canProceedToImport = canImport;

	/** Marcou "já foi paga" mas não escolheu a conta: a action recusaria. */
	const invoicePaymentBlocked =
		canAskInvoicePayment && payInvoiceOnImport && !paymentAccountId;

	/** Sem nada a mudar e sem marcar o pagamento, confirmar não faria nada. */
	/**
	 * Ajustes que o reprocessamento aplica fora dos lançamentos.
	 *
	 * Reprocessar uma fatura já conferida e já paga não mexe em lançamento
	 * nenhum, mas pode corrigir a fatura anterior e os limites do cartão — que é
	 * justamente o motivo de reprocessar. Sem contar isso, o botão de confirmar
	 * ficava desabilitado com trabalho pendente na tela.
	 */
	const hasSideAdjustments =
		(previousInvoiceReview?.hasChanges === true &&
			previousSettlementConfirmed) ||
		(amortizationConfirmed && amortizationNeedsWrite) ||
		(cardLimitsConfirmed && cardLimitsChangeLines.length > 0);

	const nothingToConfirm =
		!hasPendingImportWork &&
		!shouldPayInvoiceOnImport &&
		!hasSideAdjustments &&
		!hasAccountBalanceReconciliation;

	const balancePreviewReady =
		!hasAccountBalanceReconciliation ||
		(!accountBalancePreviewLoading &&
			accountBalancePreview != null &&
			!accountBalancePreviewError);

	const canConfirmImport =
		canProceedToImport &&
		(invoiceTotalBalanced || invoiceTotalOverrideConfirmed) &&
		balancePreviewReady;

	const canSaveDraft =
		!!statement &&
		rows.length > 0 &&
		!isPending &&
		!isImporting &&
		!isSavingDraft;

	const handleSaveDraft = () => {
		if (!statement || rows.length === 0) {
			toast.error("Nenhum progresso para salvar.");
			return;
		}

		startSaveDraftTransition(async () => {
			const batchId = await ensureImportBatchIdForDraft();
			if (!batchId) {
				toast.error(
					"Não foi possível salvar o rascunho. Reenvie o arquivo e tente novamente.",
				);
				return;
			}

			if (!sourceFile) {
				toast.error(
					"Arquivo original indisponível. Reenvie o PDF para salvar o progresso.",
				);
				return;
			}

			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			const cardId = decoded?.type === "card" ? decoded.id : null;
			const accountId = decoded?.type === "account" ? decoded.id : null;

			const uploadResult = await persistImportSourceToStorage({
				file: sourceFile,
				batchId,
				cardId: cardId ?? initialCardId ?? null,
				invoicePeriod,
				accountId,
				existingBatchId: batchId,
			});

			if (!uploadResult.success) {
				toast.error(
					uploadResult.error ??
						"Não foi possível salvar o arquivo no servidor.",
				);
				return;
			}

			const draftData = buildImportBatchDraft({
				payerId,
				accountCardValue,
				invoicePeriod,
				paymentAccountId,
				paymentDate,
				rows,
			});

			const result = await saveImportBatchDraftAction({
				batchId,
				draftData,
				cardId,
				invoicePeriod,
				accountId,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(
				result.message ?? "Importação salva. Continue depois pelo histórico.",
			);

			setImportHistory((previous) =>
				previous.map((entry) =>
					entry.id === batchId
						? {
								...entry,
								status: IMPORT_BATCH_STATUS.DRAFT,
								hasAttachment: true,
							}
						: entry,
				),
			);

			navigateAfterImportDraftSaved();
		});
	};

	const handleConfirmCancelImport = async () => {
		const batchId =
			uploadImportBatchId ??
			awaitingResumeBatch?.batchId ??
			initialResumeBatchId ??
			null;

		if (batchId) {
			const result = await deleteImportBatchClient(batchId);
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível descartar a importação.");
				throw new Error(result.error ?? "discard failed");
			}
		}

		resumeAttemptedRef.current = true;

		if (initialResumeBatchId) {
			router.replace(buildImportHrefWithoutFlowParams(window.location));
		}

		await refreshImportHistory();

		resetImportState();

		if (returnToSourceHref) {
			router.replace(returnToSourceHref);
			return;
		}
	};

	const handleImport = async () => {
		if (!statement || !canConfirmImport || isImporting) return;

		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const cardId = decoded?.type === "card" ? decoded.id : null;
		const accountId = decoded?.type === "account" ? decoded.id : null;
		const paymentMethod =
			decoded?.type === "card" ? "Cartão de crédito" : "Pix";
		const importedInvoicePeriod = invoicePeriod ?? initialInvoicePeriod;
		const invoiceReturnHref =
			cardId && importedInvoicePeriod
				? `/cards/${cardId}/invoice?periodo=${formatPeriodForUrl(importedInvoicePeriod)}`
				: null;
		const accountReturnHref =
			accountId && importedInvoicePeriod
				? buildAccountStatementHref(accountId, importedInvoicePeriod)
				: initialAccountId && importedInvoicePeriod
					? buildAccountStatementHref(initialAccountId, importedInvoicePeriod)
					: null;

		/**
		 * A action tem algo a fazer?
		 *
		 * Reprocessar um mês já fechado pode não ter lançamento, remoção nem
		 * liquidação — só a atualização de limites, que roda fora dela. Chamar a
		 * action nesse caso volta "Selecione ao menos uma transação".
		 */
		const settlementPayload =
			previousInvoiceSettlement &&
			previousInvoice &&
			previousInvoiceReview?.hasChanges &&
			previousSettlementConfirmed
				? {
						period: previousInvoice.period,
						paidAmount: previousInvoiceSettlement.paidOnPrevious,
						carriedOver: previousInvoiceSettlement.carriedOver,
						paymentTransactionId: previousInvoice.paymentTransactionId,
						paymentDate: previousInvoiceReview.changes.paymentDate
							? (statement.invoice?.paymentDate ?? null)
							: null,
					}
				: undefined;

		const amortizationPayload =
			amortizationConfirmed && amortizationNeedsWrite
				? invoiceAmortizations
				: undefined;

		const hasActionWork =
			selectedRows.length > 0 ||
			shouldPayInvoiceOnImport ||
			Boolean(settlementPayload) ||
			Boolean(amortizationPayload) ||
			rowsMarkedForRemoval.length > 0 ||
			collectExistingAmountEdits(rows).length > 0 ||
			collectExistingInstallmentEdits(rows).length > 0 ||
			hasAccountBalanceReconciliation;

		setIsImporting(true);
		try {
			const result = hasActionWork
				? await importTransactionsAction({
						rows: selectedRows.map((r) => ({
							externalId: r.externalId,
							date: r.date,
							amount: r.amount,
							description: r.description,
							transactionType: r.transactionType,
							categoryId: r.categoryId,
							payerId: r.payerId,
							kind: r.kind,
							invoicePaymentCardId: r.invoicePaymentCardId,
							invoicePaymentPeriod: r.invoicePaymentPeriod,
							transferPeerAccountId: r.transferPeerAccountId,
							installmentImport:
								r.installmentImport?.enabled &&
								isValidInstallmentImport(r.installmentImport)
									? {
											enabled: true,
											name: r.installmentImport.name,
											currentInstallment:
												r.installmentImport.currentInstallment,
											installmentCount: r.installmentImport.installmentCount,
										}
									: null,
							recurrenceImport:
								r.recurrenceImport?.enabled &&
								isValidRecurrenceImport(r.recurrenceImport)
									? {
											enabled: true,
											recurrenceCount: r.recurrenceImport.recurrenceCount,
										}
									: null,
						})),
						payerId,
						accountId,
						cardId,
						paymentMethod,
						invoicePeriod,
						payInvoice: shouldPayInvoiceOnImport,
						paymentDate: shouldPayInvoiceOnImport ? paymentDate : undefined,
						paymentAccountId: shouldPayInvoiceOnImport
							? (paymentAccountId ?? undefined)
							: undefined,
						sourceFileName: sourceFile?.name,
						sourceFileSize: sourceFile?.size,
						importBatchId: uploadImportBatchId ?? undefined,
						sourceInvoiceTotalOverride: invoiceTotalOverrideConfirmed,
						removeTransactionIds:
							rowsMarkedForRemoval.length > 0
								? rowsMarkedForRemoval
								: undefined,
						existingAmountEdits: collectExistingAmountEdits(rows),
						existingInstallmentEdits: collectExistingInstallmentEdits(rows),
						previousInvoiceSettlement: settlementPayload,
						invoiceAmortizations: amortizationPayload,
						accountStatementBalances:
							!cardId && statement?.accountBalances
								? statement.accountBalances
								: undefined,
						accountStatementFileRows:
							!cardId && statement?.accountBalances
								? mapAccountStatementReconciliationRows(rows)
								: undefined,
					})
				: {
						success: true as const,
						imported: 0,
						skipped: 0,
						importBatchId: "",
					};

			if (!result.success) {
				console.error("Falha ao importar lançamentos:", result.error);
				toast.error(result.error);
				return;
			}

			setConfirmOpen(false);

			// Limite do cartão: fora da transação da importação de propósito. Não é
			// registro financeiro, e uma falha aqui não deve derrubar a importação
			// que já foi gravada — o limite continua ajustável na tela do cartão.
			if (
				cardLimitsConfirmed &&
				invoiceCardId &&
				fileCreditLimit != null &&
				cardLimits &&
				(Math.abs(fileCreditLimit - cardLimits.limit) > 0.01 ||
					(fileGuaranteedLimit ?? null) !==
						(cardLimits.guaranteedLimit ?? null))
			) {
				void updateCardLimitsFromInvoiceAction({
					cardId: invoiceCardId,
					limit: fileCreditLimit,
					guaranteedLimit: fileGuaranteedLimit,
				});
			}

			// Salva mapeamentos description → category (fire-and-forget)
			saveCategoryMappings(
				selectedRows.map((r) => ({
					description: r.description,
					sourceDescription: r.sourceDescription,
					categoryId: r.categoryId,
					payerId: r.payerId,
				})),
			);

			const { importBatchId } = result;

			if (importBatchId && sourceFile) {
				const uploadResult = await uploadImportSourceFile({
					file: sourceFile,
					importBatchId,
					importedCount: result.imported,
					skippedCount: result.skipped,
					cardId,
					invoicePeriod,
					accountId,
				});

				if (!uploadResult.success) {
					toast.warning(
						uploadResult.error ??
							"A importação foi concluída, mas o arquivo original não foi salvo.",
					);
				}
			}
			const msg =
				result.skipped > 0
					? `${result.imported} importados, ${result.skipped} duplicatas ignoradas.`
					: `${result.imported} lançamento${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""}.`;

			toast.success(msg, {
				duration: 8000,
				action: importBatchId
					? {
							label: "Desfazer",
							onClick: async () => {
								const undo = await undoImportAction(importBatchId);
								if (undo.success) {
									toast.success("Importação desfeita.");
								} else {
									toast.error("Não foi possível desfazer.");
								}
							},
						}
					: undefined,
			});

			if (invoiceReturnHref) {
				router.replace(invoiceReturnHref);
				return;
			}

			if (accountReturnHref) {
				router.replace(accountReturnHref);
				return;
			}

			resetImportState();
			router.replace("/transactions");
		} catch (error) {
			console.error("Erro inesperado ao importar lançamentos:", error);
			toast.error("Algo deu errado ao importar. Tente novamente.");
		} finally {
			setIsImporting(false);
		}
	};

	const handleRequestImport = () => {
		if (!canProceedToImport) return;
		setInvoiceTotalOverrideConfirmed(false);
		setPayInvoiceOnImport(false);
		if (invoiceDueDate) setPaymentDate(invoiceDueDate);
		setConfirmOpen(true);
	};

	useEffect(() => {
		if (!hasAccountBalanceReconciliation) {
			setAccountBalancePreview(null);
			setAccountBalancePreviewLoading(false);
			setAccountBalancePreviewError(null);
			return;
		}

		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const accountId = decoded?.type === "account" ? decoded.id : null;
		const balances = statement?.accountBalances;

		if (!accountId || !balances || statement?.isCreditCard) {
			setAccountBalancePreview(null);
			setAccountBalancePreviewLoading(false);
			setAccountBalancePreviewError(null);
			return;
		}

		let cancelled = false;
		setAccountBalancePreviewLoading(true);
		setAccountBalancePreviewError(null);

		void previewImportBalanceReconciliationAction({
			accountId,
			balances,
			// Os dois lados usam o mesmo critério: tudo que move o saldo da conta,
			// pagamento de fatura e transferência incluídos. Filtros diferentes aqui
			// fazem o líquido do arquivo e o do cadastro medirem coisas diferentes.
			fileRows: mapAccountStatementReconciliationRows(rows),
			importedRows: mapAccountStatementReconciliationRows(selectedRows),
		}).then((result) => {
			if (cancelled) return;
			setAccountBalancePreviewLoading(false);
			if (result.success) {
				setAccountBalancePreview(result.preview);
				setAccountBalancePreviewError(null);
				return;
			}
			setAccountBalancePreview(null);
			setAccountBalancePreviewError(result.error);
		});

		return () => {
			cancelled = true;
		};
	}, [
		hasAccountBalanceReconciliation,
		accountCardValue,
		statement,
		rows,
		selectedRows,
	]);

	const currentStep = !statement ? "upload" : isImporting ? "done" : "review";

	const uploadStepComplete = useMemo(() => {
		if (importSourceStored) return true;
		if (!uploadImportBatchId) return false;
		return (
			importHistory.find((entry) => entry.id === uploadImportBatchId)
				?.hasAttachment ?? false
		);
	}, [importSourceStored, uploadImportBatchId, importHistory]);

	const cardTitle = activeInvoiceContext
		? "Revisar fatura"
		: "Importar extrato";

	const cardDescription = activeInvoiceContext
		? null
		: "Importe transações a partir de extratos ou faturas (.ofx, .csv, .txt, .pdf) ou planilha .xlsx exportada pelo seu banco.";

	const accountImportName = useMemo(() => {
		if (importHistoryFilter.cardId) return null;
		const accountId = importHistoryFilter.accountId;
		if (!accountId) return null;
		return (
			accountOptions.find((option) => option.value === accountId)?.label ?? null
		);
	}, [accountOptions, importHistoryFilter]);

	const importHistoryTitle = activeInvoiceContext
		? `Importações desta fatura (${displayPeriod(activeInvoiceContext.invoicePeriod)})`
		: accountImportName
			? `Importações desta conta (${accountImportName})`
			: importHistoryFilter.cardId
				? "Importações deste cartão"
				: "Importações recentes";

	const importHistoryViewAllHref = activeInvoiceContext
		? buildInvoiceImportHistoryHref(
				activeInvoiceContext.cardId,
				activeInvoiceContext.invoicePeriod,
			)
		: importHistoryFilter.accountId
			? buildAccountImportHistoryHref(importHistoryFilter.accountId)
			: "/transactions/import/history";

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 space-y-1">
						<CardTitle>{cardTitle}</CardTitle>
						{cardDescription ? (
							<CardDescription>{cardDescription}</CardDescription>
						) : null}
					</div>
					<ImportSteps
						active={currentStep}
						uploadComplete={uploadStepComplete}
						className="shrink-0"
					/>
				</div>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-6">
					{!statement || isChecking ? (
						<>
							{!statement && (
								<div className="flex flex-col gap-3 md:gap-4">
									{resumableDraftEntry &&
									!awaitingResumeBatch &&
									!isChecking &&
									!initialResumeBatchId ? (
										<Alert className="border-primary/20 bg-primary/5">
											<AlertTitle>Rascunho salvo</AlertTitle>
											<AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
												<span>
													Encontramos a revisão salva de{" "}
													<span className="font-medium text-foreground">
														{resumableDraftEntry.sourceFileName}
													</span>
													. Restaurando automaticamente…
												</span>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="shrink-0"
													disabled={Boolean(resumingBatchId)}
													onClick={() => {
														resumeAttemptedRef.current = false;
														void resumeImportBatch(resumableDraftEntry.id);
													}}
												>
													{resumingBatchId
														? "Carregando…"
														: "Continuar revisão"}
												</Button>
											</AlertDescription>
										</Alert>
									) : null}
									{awaitingResumeBatch ? (
										<Alert>
											<AlertTitle>Reprocessar importação</AlertTitle>
											<AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
												<span>
													O arquivo{" "}
													<span className="font-medium text-foreground">
														{awaitingResumeBatch.sourceFileName}
													</span>{" "}
													não está salvo no servidor. Selecione o mesmo arquivo
													na área abaixo para continuar esta importação.
												</span>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="shrink-0"
													onClick={() => {
														setAwaitingResumeBatch(null);
														setUploadImportBatchId(null);
													}}
												>
													Cancelar
												</Button>
											</AlertDescription>
										</Alert>
									) : null}
									{importPdfPasswordNeedsReconfigure && linkedCardId ? (
										<Alert variant="destructive">
											<AlertTitle>Senha automática do PDF indisponível</AlertTitle>
											<AlertDescription className="text-sm">
												{IMPORT_PDF_PASSWORD_UNREADABLE_MESSAGE}
											</AlertDescription>
										</Alert>
									) : null}
									<UploadZone
										onParsingChange={(parsing) =>
											setImportProgress(parsing ? "parsing" : null)
										}
										onParsed={handleUploadParsed}
										error={fileError}
										onErrorClear={() => setFileError(null)}
										linkedCardId={linkedCardId}
										autoPdfPasswordAttempts={autoPdfPasswordAttempts}
										importHistory={contextualImportHistory}
										resumeBatchId={awaitingResumeBatch?.batchId ?? null}
										onDuplicateBatchCleared={() => {
											void refreshImportHistory();
										}}
									/>
									<ImportFileHistory
										entries={contextualImportHistory}
										title={importHistoryTitle}
										compact
										limit={10}
										allowDelete
										viewAllHref={importHistoryViewAllHref}
										resumingBatchId={resumingBatchId}
										description={
											activeInvoiceContext
												? "Arquivos já enviados para esta fatura. Reprocessar não cria entrada nova — só um novo upload registra outro item. O sistema avisa se você tentar enviar o mesmo arquivo de novo."
												: hasImportHistoryFilter(importHistoryFilter)
													? "Arquivos já enviados para esta conta. Reprocessar reutiliza o registro existente."
													: "Arquivos importados recentemente. Reprocessar reutiliza o registro existente."
										}
									/>
								</div>
							)}
							{isChecking && (
								<div className="flex flex-col gap-3">
									<Skeleton className="h-10 w-full" />
									<Skeleton className="h-10 w-full" />
									<div className="flex flex-col gap-2 rounded-lg border p-4">
										{Array.from({ length: 6 }).map((_, i) => (
											<Skeleton key={i} className="h-8 w-full" />
										))}
									</div>
								</div>
							)}
						</>
					) : (
						<>
							<ImportSummary
								statement={statement}
								invoicePeriod={invoicePeriod}
								accountCard={selectedAccountCardSummary}
								total={rows.length}
								selected={selectedRows.length}
								duplicates={duplicateCount}
								duplicateVerified={duplicateVerifiedCount}
								duplicateMismatch={duplicateMismatchCount}
								linkSuggestions={linkSuggestionCount}
								uncategorized={uncategorizedCount}
								withoutPayer={withoutPayerCount}
								amountCorrectionCount={amountCorrectionCount}
								installmentCorrectionCount={installmentCorrectionCount}
							/>

							{previousInvoiceReview && previousInvoice ? (
								<PreviousInvoiceSettlementCard
									review={previousInvoiceReview}
									previousPeriod={previousInvoice.period}
									carriedOver={previousInvoiceSettlement?.carriedOver ?? 0}
									payments={invoicePaymentAllocation?.payments ?? []}
									onFix={
										previousInvoice.paymentTransactionId &&
										statement?.invoice?.paymentDate
											? () => setFixPreviousOpen(true)
											: undefined
									}
								/>
							) : null}

							{fileCreditLimit != null && cardLimits ? (
								<CardLimitsCard
									fileLimit={fileCreditLimit}
									fileGuaranteedLimit={fileGuaranteedLimit}
									registeredLimit={cardLimits.limit}
									registeredGuaranteedLimit={cardLimits.guaranteedLimit}
									confirmed={cardLimitsConfirmed}
									onConfirmedChange={setCardLimitsConfirmed}
								/>
							) : null}

							{importInvoiceReconciliation && invoiceSourceTotal ? (
								<InvoiceTotalReconciliationBanner
									reconciliation={importInvoiceReconciliation}
									sourceKind={invoiceSourceTotal.source}
									confidence={invoiceSourceTotal.confidence}
									invoiceExtraCount={invoiceExtraReviewStats.count}
									invoiceExtraMarkedForRemovalCount={
										invoiceExtraReviewStats.markedForRemovalCount
									}
									crossPeriodCount={crossPeriodReviewStats.count}
									crossPeriodDisplayTotal={crossPeriodReviewStats.displayTotal}
									fileFinanceCharges={
										statement.invoice?.financeChargesTotal ?? null
									}
									fileFinanceChargesLabel={
										statement.invoice?.financeChargesLabel ?? null
									}
									selectedFinanceCharges={selectedFinanceCharges}
									sourceFile={sourceFile}
								/>
							) : null}

							<GlobalFields
								accountOptions={accountOptions}
								cardOptions={cardOptions}
								payerOptions={payerOptions}
								categoryOptions={mergedCategoryOptions}
								accountCardValue={accountCardValue}
								payerId={payerId}
								invoicePeriod={invoicePeriod}
								onAccountCardChange={setAccountCardValue}
								onPayerChange={handleBulkPayerChange}
								onInvoicePeriodChange={setInvoicePeriod}
								onBulkCategoryChange={handleBulkCategoryChange}
								onCreateCategory={handleRequestBulkCreateCategory}
							/>

							<ImportAiAnalysisBanner
								status={aiAnalysisStatus}
								progress={aiAnalysisProgress}
								errorMessage={aiAnalysisError}
								errorLog={aiAnalysisErrorLog}
								summary={aiAnalysisSummary}
								onRetry={
									aiAnalysisEnabled && rows.length > 0
										? handleRetryImportAiAnalysis
										: undefined
								}
								isRetrying={aiAnalysisStatus === "running"}
							/>

							{aiStoredKeysInvalid ? (
								<Alert variant="destructive">
									<AlertTitle>Chave de IA ilegível</AlertTitle>
									<AlertDescription className="text-sm">
										{aiStoredKeysInvalidMessage}
									</AlertDescription>
								</Alert>
							) : null}

							<ReviewTable
								rows={rows}
								defaultPayerId={defaultPayerId}
								payerOptions={payerOptions}
								categoryOptions={mergedCategoryOptions}
								cardOptions={cardOptions}
								transferAccountOptions={transferAccountOptions}
								isCard={isCard}
								invoicePeriod={invoicePeriod}
								invoicePeriodExistingIdSet={invoicePeriodExistingIdSet}
								periodLockedExistingIds={periodLockedExistingIds}
								onToggle={toggleRow}
								onToggleAll={toggleAll}
								onToggleAllFiltered={toggleAllFiltered}
								onPayerChange={handlePayerChange}
								onCategoryChange={handleCategoryChange}
								onCreateCategory={handleRequestCreateCategory}
								onRowTypeChange={handleRowTypeChange}
								onInvoicePaymentCardChange={handleInvoicePaymentCardChange}
								onInvoicePaymentPeriodChange={handleInvoicePaymentPeriodChange}
								onTransferPeerAccountChange={handleTransferPeerAccountChange}
								onCreateTransferPeerAccount={
									handleRequestCreateTransferPeerAccount
								}
								onDescriptionChange={handleDescriptionChange}
								onInstallmentToggle={handleInstallmentToggle}
								onInstallmentDismiss={handleInstallmentDismiss}
								onInstallmentCountChange={handleInstallmentCountChange}
								onInstallmentCurrentChange={handleInstallmentCurrentChange}
								onUndoDuplicate={handleUndoDuplicate}
								onEditDuplicate={handleEditDuplicate}
								onLinkDuplicate={handleOpenLinkDuplicate}
								onDismissLinkSuggestion={handleDismissLinkSuggestion}
								onConvertToInstallment={handleConvertToInstallment}
								onConvertToRecurrence={handleConvertToRecurrence}
								onRecurrenceToggle={handleRecurrenceToggle}
								onRecurrenceCountChange={handleRecurrenceCountChange}
								onAmountChange={handleAmountChange}
								onMoveToInvoicePeriod={handleMoveToInvoicePeriod}
								linkSuggestionCount={linkSuggestionCount}
								isLinkingSuggestions={isLinking}
								onLinkAllSuggestions={handleLinkAllSuggestions}
							/>

							{/* Sticky footer */}
							<div className="sticky bottom-0 -mx-6 bg-card px-6 pt-3 pb-1">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex flex-row flex-wrap items-center gap-2">
										<Button
											type="button"
											variant="outline"
											onClick={() => setCancelConfirmOpen(true)}
											disabled={isPending || isSavingDraft}
										>
											Cancelar
										</Button>
										<Button
											type="button"
											variant="outline"
											onClick={handleSaveDraft}
											disabled={!canSaveDraft}
										>
											<RiSaveLine className="size-4" aria-hidden />
											{isSavingDraft ? "Salvando…" : "Continuar depois"}
										</Button>
										{rows.length > 0 &&
										isChecking &&
										!isPending &&
										!isSavingDraft ? (
											<p className="text-muted-foreground text-sm sm:max-w-xs">
												Aguarde o processamento para salvar o rascunho.
											</p>
										) : null}
									</div>

									<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
										{!accountCardValue ? (
											<p className="text-muted-foreground text-sm">
												Selecione uma conta ou cartão para continuar.
											</p>
										) : unresolvedInvoicePayments > 0 ? (
											<p className="text-muted-foreground text-sm">
												{unresolvedInvoicePayments} pagamento
												{unresolvedInvoicePayments !== 1 ? "s" : ""} de fatura
												sem cartão ou período.
											</p>
										) : unresolvedTransfers > 0 ? (
											<p className="text-muted-foreground text-sm">
												{unresolvedTransfers} transferência
												{unresolvedTransfers !== 1 ? "s" : ""} sem a outra conta
												selecionada.
											</p>
										) : hasInvoicePayments &&
											!accountCardValue.startsWith("account:") ? (
											<p className="text-muted-foreground text-sm">
												Pagamentos de fatura exigem uma conta corrente
												selecionada.
											</p>
										) : uncategorizedCount > 0 ? (
											<p className="text-muted-foreground text-sm">
												{uncategorizedCount} lançamento
												{uncategorizedCount !== 1 ? "s" : ""} sem categoria.
											</p>
										) : isCard && !invoicePeriod ? (
											<p className="text-muted-foreground text-sm">
												Selecione a fatura para continuar.
											</p>
										) : invalidInstallmentCount > 0 ? (
											<p className="text-muted-foreground text-sm">
												Revise os dados do parcelamento antes de importar.
											</p>
										) : invalidRecurrenceCount > 0 ? (
											<p className="text-muted-foreground text-sm">
												Revise os dados da recorrência antes de importar.
											</p>
										) : importableRows.length > 0 &&
											selectedRows.length === 0 ? (
											<p className="text-muted-foreground text-sm">
												Selecione ao menos um lançamento para importar.
											</p>
										) : hasAccountBalanceReconciliation &&
											importRecordCount === 0 ? (
											<p className="text-muted-foreground text-sm">
												Todos os lançamentos já estão conferidos. Ao confirmar,
												o saldo da conta será ajustado conforme o extrato.
											</p>
										) : canProceedToImport &&
											importInvoiceReconciliation &&
											!invoiceTotalBalanced ? (
											<p className="text-muted-foreground text-sm">
												Diferença de{" "}
												{formatCurrency(
													Math.abs(importInvoiceReconciliation.delta),
												)}{" "}
												em relação ao total do arquivo. Revise os lançamentos ou
												confirme a importação mesmo assim.
											</p>
										) : null}
										<Button
											onClick={handleRequestImport}
											disabled={!canProceedToImport}
											className="w-full sm:w-auto"
										>
											{isImporting
												? "Processando…"
												: hasAccountBalanceReconciliation &&
														importRecordCount === 0
													? "Atualizar saldo da conta"
													: importRecordCount > 0
														? `Processar arquivo (${importRecordCount} lançamento${importRecordCount !== 1 ? "s" : ""})`
														: "Processar arquivo"}
										</Button>
									</div>
								</div>
							</div>
						</>
					)}
				</div>
			</CardContent>
			<ConfirmActionDialog
				open={cancelConfirmOpen}
				onOpenChange={setCancelConfirmOpen}
				title="Descartar importação?"
				description="O progresso desta revisão será perdido. Use Continuar depois se quiser salvar e retomar pelo histórico."
				confirmLabel="Descartar"
				confirmVariant="destructive"
				onConfirm={handleConfirmCancelImport}
			/>
			{confirmOpen ? (
				<ImportConfirmDialog
					open={confirmOpen}
					onOpenChange={setConfirmOpen}
					importCount={importRecordCount}
					verifiedCount={importSummary.verifiedCount}
					replacedCount={importSummary.replacedCount}
					excludedCount={importSummary.excludedCount}
					removalCount={importSummary.removalCount}
					installmentBackfillCount={importSummary.installmentBackfillCount}
					amountCorrectionCount={amountCorrectionCount}
					isPending={isImporting}
					invoiceTotalDelta={importInvoiceReconciliation?.delta ?? null}
					invoiceTotalOverrideConfirmed={invoiceTotalOverrideConfirmed}
					onInvoiceTotalOverrideChange={setInvoiceTotalOverrideConfirmed}
					canConfirm={
						canConfirmImport && !invoicePaymentBlocked && !nothingToConfirm
					}
					nothingToConfirm={nothingToConfirm}
					cardLimits={
						cardLimitsChangeLines.length > 0
							? {
									changeLines: cardLimitsChangeLines,
									confirmed: cardLimitsConfirmed,
									onConfirmedChange: setCardLimitsConfirmed,
								}
							: null
					}
					invoiceAmortization={
						amortizationNeedsWrite
							? {
									changeLines: amortizationChangeLines,
									confirmed: amortizationConfirmed,
									onConfirmedChange: setAmortizationConfirmed,
								}
							: null
					}
					accountBalance={accountBalancePreview}
					accountBalanceLoading={accountBalancePreviewLoading}
					accountBalanceError={accountBalancePreviewError}
					showAccountBalanceSection={hasAccountBalanceReconciliation}
					previousInvoice={
						previousInvoiceReview && previousInvoice
							? {
									previousPeriodLabel: displayPeriod(previousInvoice.period),
									checks: previousInvoiceReview.checks,
									allOk: previousInvoiceReview.allOk,
									hasChanges: previousInvoiceReview.hasChanges,
									changeLines: previousSettlementChangeLines,
									confirmed: previousSettlementConfirmed,
									onConfirmedChange: setPreviousSettlementConfirmed,
								}
							: null
					}
					invoicePayment={
						canAskInvoicePayment
							? {
									alreadyPaid:
										currentInvoice?.paymentStatus ===
										INVOICE_PAYMENT_STATUS.PAID
											? {
													date: currentInvoice.paymentTransactionDate,
													amount: currentInvoice.paymentTransactionAmount,
													reopened: invoicePaymentReopened,
													onReopenedChange: setInvoicePaymentReopened,
												}
											: null,
									dueDate: invoiceDueDate,
									paid: payInvoiceOnImport,
									onPaidChange: setPayInvoiceOnImport,
									paymentDate,
									onPaymentDateChange: setPaymentDate,
									accountOptions: accountOptions.map((option) => ({
										value: option.value,
										label: option.label,
										logo: option.logo ?? null,
									})),
									accountId: paymentAccountId,
									onAccountChange: setPaymentAccountId,
								}
							: null
					}
					onConfirm={() => void handleImport()}
				/>
			) : null}
			{importProgress ? (
				<ImportProgressDialog step={importProgress} />
			) : null}

			{previousInvoice?.paymentTransactionId &&
			statement?.invoice?.paymentDate &&
			fixPreviousOpen ? (
				<PreviousInvoiceFixDialog
					open={fixPreviousOpen}
					onOpenChange={setFixPreviousOpen}
					isPending={isFixingPrevious}
					target={{
						periodLabel: displayPeriod(previousInvoice.period),
						cardName: selectedAccountCardSummary?.label ?? "Cartão",
						registeredTotal: previousInvoice.total,
						registeredPaymentDate: previousInvoice.paymentTransactionDate,
						suggestedPaymentDate: statement.invoice.paymentDate,
					}}
					onConfirm={(paymentDate) => {
						const transactionId = previousInvoice.paymentTransactionId;
						if (!transactionId) return;

						startFixPrevious(async () => {
							const result = await updatePreviousInvoicePaymentDateAction({
								transactionId,
								paymentDate,
							});

							if (!result.success) {
								toast.error(
									result.error ?? "Não foi possível corrigir a data.",
								);
								return;
							}

							toast.success("Data do pagamento corrigida.");
							setFixPreviousOpen(false);
							// Recarrega o snapshot para o bloco refletir a correção.
							if (invoiceCardId && invoiceTargetPeriod) {
								const snapshot = await fetchInvoiceSnapshotAction({
									cardId: invoiceCardId,
									period: invoiceTargetPeriod,
								});
								setPreviousInvoice(snapshot);
							}
						});
					}}
				/>
			) : null}

			{periodMismatch ? (
				<ImportInvoicePeriodMismatchDialog
					open
					onOpenChange={(open) => {
						if (!open) setPeriodMismatch(null);
					}}
					cardName={periodMismatch.cardName}
					expectedPeriod={periodMismatch.expectedPeriod}
					filePeriod={periodMismatch.filePeriod}
					onConfirm={() => void handleConfirmPeriodMismatch()}
				/>
			) : null}
			{categoryCreateOpen ? (
				<LazyCreateCategoryInlineDialog
					open={categoryCreateOpen}
					onOpenChange={(open) => {
						setCategoryCreateOpen(open);
						if (!open) {
							setCategoryCreateRowIndex(null);
							setCategoryCreateBulk(false);
						}
					}}
					onCreated={handleCategoryCreated}
					allCategories={allCategoriesForDialog}
					defaultType={categoryCreateDefaultType}
				/>
			) : null}
			{accountCreateOpen ? (
				<LazyCreateAccountInlineDialog
					open={accountCreateOpen}
					onOpenChange={(open) => {
						setAccountCreateOpen(open);
						if (!open) {
							setAccountCreateRowIndex(null);
						}
					}}
					onCreated={handleTransferPeerAccountCreated}
				/>
			) : null}
			{linkDialogIndex !== null && rows[linkDialogIndex] ? (
				<ImportLinkDialog
					open={linkDialogIndex !== null}
					onOpenChange={(open) => {
						if (!open) setLinkDialogIndex(null);
					}}
					importedDescription={rows[linkDialogIndex].description}
					importedDate={rows[linkDialogIndex].date}
					importedAmount={rows[linkDialogIndex].amount}
					importedCategoryLabel={resolveImportCategoryLabel(
						rows[linkDialogIndex].categoryId,
					)}
					existingCategoryLabel={resolveImportCategoryLabel(
						rows[linkDialogIndex].duplicateValidation?.existingCategoryId,
					)}
					showCategory={
						rows[linkDialogIndex].duplicateValidation?.existingIsTransfer !==
						true
					}
					validation={rows[linkDialogIndex].duplicateValidation}
					isPending={isLinking}
					onConfirm={(mergeDescription) =>
						void handleConfirmLinkDuplicate(mergeDescription)
					}
				/>
			) : null}
			{editDialogOptions && editTransaction ? (
				<TransactionDialog
					mode="update"
					open={editDialogOpen}
					onOpenChange={(open) => {
						setEditDialogOpen(open);
						if (!open) {
							setEditTransaction(null);
						}
					}}
					payerOptions={editDialogOptions.payerOptions}
					splitPayerOptions={editDialogOptions.splitPayerOptions}
					defaultPayerId={editDialogOptions.defaultPayerId}
					accountOptions={editDialogOptions.accountOptions}
					cardOptions={editDialogOptions.cardOptions}
					categoryOptions={editDialogOptions.categoryOptions}
					estabelecimentos={editDialogOptions.estabelecimentos}
					transaction={editTransaction}
					defaultPeriod={editTransaction.period}
					onSuccess={() => void handleEditDuplicateSuccess()}
				/>
			) : null}
		</Card>
	);
}
