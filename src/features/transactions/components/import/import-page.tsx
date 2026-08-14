"use client";

import { RiSaveLine } from "@remixicon/react";
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
	CreateAccountInlineDialog,
	type CreatedAccount,
} from "@/features/accounts/components/create-account-inline-dialog";
import {
	CreateCategoryInlineDialog,
	type CreatedCategory,
} from "@/features/categories/components/create-category-inline-dialog";
import type { Category } from "@/features/categories/components/types";
import {
	fetchImportDescriptionMemory,
	saveCategoryMappings,
} from "@/features/transactions/actions/category-memory-action";
import { fetchTransactionByIdAction } from "@/features/transactions/actions/fetch-by-id";
import {
	fetchTransactionDialogOptionsAction,
	type TransactionDialogOptions,
} from "@/features/transactions/actions/fetch-dialog-options";
import {
	checkDuplicateFitIds,
	deleteImportDuplicateTransaction,
	deleteTransactionByFitId,
	fetchAccountImportDuplicateSnapshots,
	fetchCardInstallmentDuplicateSnapshots,
	fetchImportDuplicateSnapshots,
	fetchInvoicePeriodDuplicateSnapshots,
	importTransactionsAction,
	linkImportToExistingAction,
	undoImportAction,
} from "@/features/transactions/actions/import-action";
import {
	analyzeImportAiBatchAction,
	prepareImportAiAnalysisAction,
} from "@/features/transactions/actions/import-ai-analysis-action";
import {
	deleteImportBatchAction,
	fetchImportBatchHistoryAction,
	getImportBatchDraftAction,
	getImportBatchResumeAction,
	registerImportUploadAction,
	saveImportBatchDraftAction,
	syncImportBatchContextAction,
} from "@/features/transactions/actions/import-batch-history-action";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
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
import { ImportConfirmDialog } from "@/features/transactions/components/import/import-confirm-dialog";
import { ImportFileHistory } from "@/features/transactions/components/import/import-file-history";
import { ImportInvoicePeriodMismatchDialog } from "@/features/transactions/components/import/import-invoice-period-mismatch-dialog";
import { ImportLinkDialog } from "@/features/transactions/components/import/import-link-dialog";
import { ImportSteps } from "@/features/transactions/components/import/import-steps";
import { ImportSummary } from "@/features/transactions/components/import/import-summary";
import {
	type ReviewRow,
	ReviewTable,
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
	buildImportLandingHref,
	buildInvoiceImportHistoryHref,
} from "@/features/transactions/lib/import-continue-href";
import {
	type ImportDuplicateSnapshot,
	type ImportDuplicateValidation,
	isImportLinkSuggestion,
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
import {
	guessInvoicePaymentCardId,
	guessInvoicePaymentPeriod,
	isInvoicePaymentDescription,
} from "@/features/transactions/lib/import-invoice-payment";
import {
	resolveImportPaymentDate,
	resolveInvoicePeriodFromMetadata,
	resolveInvoicePeriodFromStatement,
	resolveUploadInvoicePeriodFromStatement,
} from "@/features/transactions/lib/import-invoice-period";
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
import type { CategoryType } from "@/shared/lib/categories/constants";
import { INVOICE_PAYMENT_CATEGORY_NAME } from "@/shared/lib/categories/constants";
import {
	buildPeriodFromTransactions,
	dedupeImportedTransactionsByFingerprint,
	normalizeImportedText,
	stripImportExternalIdSuffix,
	uniquifyImportedExternalIds,
} from "@/shared/lib/import/helpers";
import { mapPdfLoadError } from "@/shared/lib/import/pdf-password";
import type { ImportStatement } from "@/shared/lib/import/types";
import { getTodayDateString } from "@/shared/utils/date";
import { displayPeriod, formatPeriodForUrl } from "@/shared/utils/period";

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
		transactions: dedupeImportedTransactionsByFingerprint(
			uniquifyImportedExternalIds(normalizedTransactions),
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

interface ImportPageProps {
	payerOptions: SelectOption[];
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
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
	initialImportHistory?: ImportFileHistoryEntry[];
	initialResumeBatchId?: string | null;
	importMountKey: string;
}

export function ImportPage({
	payerOptions,
	accountOptions,
	cardOptions,
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
	initialImportHistory = EMPTY_INITIAL_IMPORT_HISTORY,
	initialResumeBatchId = null,
	importMountKey,
}: ImportPageProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isSavingDraft, startSaveDraftTransition] = useTransition();
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
		const entries = await fetchImportBatchHistoryAction({
			cardId: importHistoryFilter.cardId,
			invoicePeriod: importHistoryFilter.cardId
				? importHistoryFilter.invoicePeriod
				: null,
			accountId: importHistoryFilter.accountId,
			limit: 50,
		});
		setImportHistory(entries);
	}, [importHistoryFilter]);
	const [editTransaction, setEditTransaction] =
		useState<TransactionItem | null>(null);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [linkDialogIndex, setLinkDialogIndex] = useState<number | null>(null);
	const [isLinking, setIsLinking] = useState(false);
	const [editDialogOptions, setEditDialogOptions] =
		useState<TransactionDialogOptions | null>(null);

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

			try {
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

		const statementPeriod =
			statement.period ?? buildPeriodFromTransactions(statement.transactions);

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

			const period = resolveInvoicePeriodFromStatement(
				stmt.invoice,
				stmt.transactions,
				selectedCardOption,
			);

			if (period) {
				setInvoicePeriod(period);
			}
		},
		[selectedCardOption],
	);

	const processParsedStatement = useCallback(
		async (
			stmt: ImportStatement,
			options?: { draftData?: ImportBatchDraftData | null },
		) => {
			const normalizedStatement = withNormalizedDescriptions(stmt);
			setStatement(normalizedStatement);

			const periodFromFile =
				resolveInvoicePeriodFromMetadata(normalizedStatement.invoice) ??
				resolveInvoicePeriodFromStatement(
					normalizedStatement.invoice,
					normalizedStatement.transactions,
					selectedCardOption,
				);
			if (periodFromFile) {
				setInvoicePeriod(periodFromFile);
			}

			setPaymentDate(resolveImportPaymentDate(normalizedStatement.invoice));

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
				normalizedStatement.period ??
				buildPeriodFromTransactions(normalizedStatement.transactions);

			setIsChecking(true);
			duplicateMatchingContextRef.current = null;

			try {
				const fitIds = normalizedStatement.transactions
					.map((t) => t.externalId)
					.filter((id): id is string => id !== null);

				const shouldFetchInvoiceSnapshots =
					stmt.isCreditCard && Boolean(resolvedCardId);

				const shouldFetchAccountSnapshots =
					!stmt.isCreditCard && resolvedAccountId && statementPeriod;

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

				const duplicateSnapshotByFitId = buildDuplicateSnapshotByFitId(
					duplicateSnapshots,
				);

				const semanticCandidates = shouldFetchInvoiceSnapshots
					? mergeImportDuplicateSnapshots(
							invoicePeriodSnapshots,
							cardInstallmentSnapshots,
						)
					: accountImportSnapshots;

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
					const transferGuess = isInvoicePayment
						? null
						: guessImportTransfer(
								t.description,
								t.transactionType,
								accountOptions,
								resolvedAccountId,
							);
					const guessedCardId = isInvoicePayment
						? guessInvoicePaymentCardId(t.description, cardOptions)
						: null;
					const guessedPeriod = isInvoicePayment
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

					if (isInvoicePayment && pagamentosCategoryId) {
						mappedCategoryId = pagamentosCategoryId;
					}

					const installmentImport = rowInputs[index].installmentImport;
					const duplicateState = duplicateStates[index];
					const isDuplicate = duplicateState.isDuplicate;
					const duplicateValidation = duplicateState.duplicateValidation;
					const isLinkSuggestion =
						duplicateValidation?.status === "link_suggestion";

					let resolvedCategoryId =
						transferGuess || isInvoicePayment
							? isInvoicePayment
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
						isDuplicate,
						selected: isDuplicate || isLinkSuggestion ? false : true,
						duplicateValidation,
						linked: false,
						linkedTransactionId: null,
						payerId: resolvedPayerId,
						kind: transferGuess?.kind
							? transferGuess.kind
							: isInvoicePayment
								? ("invoice_payment" as const)
								: ("transaction" as const),
						invoicePaymentCardId: guessedCardId,
						invoicePaymentPeriod: guessedPeriod,
						transferPeerAccountId: transferGuess?.transferPeerAccountId ?? null,
						installmentImport: transferGuess ? null : installmentImport,
						recurrenceImport: null,
						categoryId: resolvedCategoryId,
					};
				});

				const rowsWithDraft = draftData
					? applyImportBatchDraftToRows(builtRows, draftData)
					: builtRows;

				setRows(rowsWithDraft);

				void triggerImportAiAnalysis(rowsWithDraft, {
					isCreditCard: stmt.isCreditCard,
					cardId: resolvedCardId,
					accountId: resolvedAccountId,
					invoicePeriods: invoicePeriodsForSnapshots,
					statementPeriod: shouldFetchAccountSnapshots ? statementPeriod : null,
					cardName: selectedCardOption?.label ?? null,
					accountName:
						accountOptions.find((option) => option.value === resolvedAccountId)
							?.label ?? null,
				});

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
			} finally {
				setIsChecking(false);
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

		const statementPeriod =
			statement.period ?? buildPeriodFromTransactions(statement.transactions);

		const invoicePeriodsForSnapshots = [
			...new Set(
				[
					invoicePeriod,
					activeInvoiceContext?.invoicePeriod,
					initialInvoicePeriod,
				].filter((period): period is string => Boolean(period)),
			),
		];

		const shouldFetchInvoiceSnapshots =
			statement.isCreditCard && Boolean(resolvedCardId);
		const shouldFetchAccountSnapshots =
			!statement.isCreditCard && resolvedAccountId && statementPeriod;

		if (!shouldFetchInvoiceSnapshots && !shouldFetchAccountSnapshots) {
			return;
		}

		const fitIds = rows
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

			const duplicateSnapshotByFitId = buildDuplicateSnapshotByFitId(
				duplicateSnapshots,
			);

			const semanticCandidates = shouldFetchInvoiceSnapshots
				? mergeImportDuplicateSnapshots(
						invoicePeriodSnapshots,
						cardInstallmentSnapshots,
					)
				: accountImportSnapshots;

			const duplicateStates = resolveImportDuplicateMatches(
				rows.map((row) => ({
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

			setRows((previousRows) =>
				previousRows.map((row, index) => {
					if (row.linked || row.reimported || row.linkedTransactionId) {
						return row;
					}

					const duplicateState = duplicateStates[index];
					if (!duplicateState) return row;

					const isLinkSuggestion =
						duplicateState.duplicateValidation?.status === "link_suggestion";
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
						categoryId: resolvedCategoryId,
					};
				}),
			);
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

	// Pré-seleciona cartão ou conta com base no tipo detectado no OFX
	useEffect(() => {
		if (!statement || accountCardValue) return;
		if (statement.isCreditCard && cardOptions[0]) {
			setAccountCardValue(encodeAccountCard("card", cardOptions[0].value));
		} else if (!statement.isCreditCard && accountOptions[0]) {
			setAccountCardValue(
				encodeAccountCard("account", accountOptions[0].value),
			);
		}
	}, [statement, cardOptions, accountOptions, accountCardValue]);

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
			prev.map((r) =>
				isImportRowResolved(r) || isImportLinkSuggestion(r)
					? { ...r, selected: false }
					: { ...r, selected },
			),
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
					return { ...r, selected };
				}
				return r;
			}),
		);
	};

	const handleCategoryChange = (index: number, categoryId: string | null) => {
		setRows((prev) =>
			prev.map((r, i) =>
				i === index &&
				r.kind === "transaction" &&
				isCategoryCompatible(categoryId, r.transactionType)
					? { ...r, categoryId }
					: r,
			),
		);
	};

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
				fetchTransactionByIdAction(transactionId),
				editDialogOptions ?? fetchTransactionDialogOptionsAction(),
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

	const handleOpenLinkDuplicate = useCallback((index: number) => {
		setLinkDialogIndex(index);
	}, []);

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
		async (mergeDescription: "import" | "existing") => {
			if (linkDialogIndex === null) return;

			const row = rows[linkDialogIndex];
			const validation = row?.duplicateValidation;
			if (!validation || validation.status !== "link_suggestion") return;

			const resolvedPayerId =
				validation.existingPayerId ?? row.payerId ?? payerId ?? defaultPayerId;

			setIsLinking(true);
			try {
				const result = await linkImportToExistingAction({
					existingTransactionId: validation.existingTransactionId,
					importedDescription: row.description,
					externalId: row.externalId,
					mergeDescription,
					fallbackPayerId: resolvedPayerId,
				});

				if (!result.success) {
					toast.error(result.error);
					return;
				}

				setRows((prev) =>
					prev.map((currentRow, rowIndex) =>
						rowIndex === linkDialogIndex
							? {
									...currentRow,
									linked: true,
									linkedTransactionId: validation.existingTransactionId,
									selected: false,
									payerId: resolvedPayerId,
									duplicateValidation: null,
								}
							: currentRow,
					),
				);
				setLinkDialogIndex(null);
				toast.success("Lançamento vinculado ao cadastro existente.");
			} finally {
				setIsLinking(false);
			}
		},
		[linkDialogIndex, rows, payerId, defaultPayerId],
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
	const isPaidInvoiceImport = Boolean(
		statement?.isCreditCard && statement.invoice?.isPaid,
	);

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
		const selected = rows.filter((r) => r.selected);
		const duplicateRows = rows.filter((r) => r.isDuplicate);
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

	const importRecordCount = countImportRecords(selectedRows);
	const importableRows = rows.filter(
		(row) => !isImportRowResolved(row) && !isImportLinkSuggestion(row),
	);
	const canPayImportedInvoiceOnly =
		isPaidInvoiceImport &&
		!!paymentAccountId &&
		!!accountCardValue &&
		(!isCard || !!invoicePeriod) &&
		rows.length > 0 &&
		selectedRows.length === 0 &&
		importableRows.length === 0;

	const importSummary = useMemo(() => {
		const verifiedCount = rows.filter(isVerifiedImportDuplicate).length;
		const linkedCount = rows.filter((row) => row.linked).length;
		const excludedCount = rows.filter(
			(row) =>
				!row.selected &&
				!isImportRowResolved(row) &&
				!isImportLinkSuggestion(row),
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
			replacedCount,
			installmentBackfillCount,
		};
	}, [rows, selectedRows]);

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

	const canImport =
		(selectedRows.length > 0 || canPayImportedInvoiceOnly) &&
		!!accountCardValue &&
		uncategorizedCount === 0 &&
		withoutPayerCount === 0 &&
		unresolvedInvoicePayments === 0 &&
		unresolvedTransfers === 0 &&
		invalidInstallmentCount === 0 &&
		invalidRecurrenceCount === 0 &&
		(!isCard || !!invoicePeriod) &&
		(!hasInvoicePayments || accountCardValue.startsWith("account:")) &&
		(!isPaidInvoiceImport || !!paymentAccountId) &&
		!isPending;

	const canSaveDraft =
		!!statement && rows.length > 0 && !isPending && !isSavingDraft;

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
			const result = await deleteImportBatchAction({ batchId });
			if (!result.success) {
				toast.error(result.error ?? "Não foi possível descartar a importação.");
				throw new Error(result.error ?? "discard failed");
			}
		}

		resumeAttemptedRef.current = true;

		if (initialResumeBatchId) {
			const params = new URLSearchParams(window.location.search);
			params.delete("lote");
			params.delete("retomar");
			const query = params.toString();
			router.replace(
				query
					? `${window.location.pathname}?${query}`
					: window.location.pathname,
			);
		}

		await refreshImportHistory();

		resetImportState();

		if (returnToSourceHref) {
			router.replace(returnToSourceHref);
			return;
		}
	};

	const handleImport = () => {
		if (!statement || !canImport) return;

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

		startTransition(async () => {
			const result = await importTransactionsAction({
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
									currentInstallment: r.installmentImport.currentInstallment,
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
				payInvoice: isPaidInvoiceImport,
				paymentDate: isPaidInvoiceImport ? paymentDate : undefined,
				paymentAccountId: isPaidInvoiceImport ? paymentAccountId : undefined,
				sourceFileName: sourceFile?.name,
				sourceFileSize: sourceFile?.size,
				importBatchId: uploadImportBatchId ?? undefined,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			setConfirmOpen(false);

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
			const msg = isPaidInvoiceImport
				? result.imported > 0
					? result.skipped > 0
						? `Fatura paga com ${result.imported} lançamentos importados (${result.skipped} duplicatas ignoradas).`
						: `Fatura paga com ${result.imported} lançamento${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""}.`
					: "Fatura marcada como paga."
				: result.skipped > 0
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
		});
	};

	const handleRequestImport = () => {
		if (!canImport) return;
		setConfirmOpen(true);
	};

	const currentStep = !statement ? "upload" : isPending ? "done" : "review";

	const uploadStepComplete = useMemo(() => {
		if (importSourceStored) return true;
		if (!uploadImportBatchId) return false;
		return (
			importHistory.find((entry) => entry.id === uploadImportBatchId)
				?.hasAttachment ?? false
		);
	}, [importSourceStored, uploadImportBatchId, importHistory]);

	const cardTitle = activeInvoiceContext
		? isPaidInvoiceImport
			? "Pagar fatura"
			: "Revisar fatura"
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
									<UploadZone
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
								paymentDate={paymentDate}
								isPaidInvoiceImport={isPaidInvoiceImport}
								total={rows.length}
								selected={selectedRows.length}
								duplicates={duplicateCount}
								duplicateVerified={duplicateVerifiedCount}
								duplicateMismatch={duplicateMismatchCount}
								linkSuggestions={linkSuggestionCount}
								uncategorized={uncategorizedCount}
								withoutPayer={withoutPayerCount}
							/>

							<GlobalFields
								accountOptions={accountOptions}
								cardOptions={cardOptions}
								payerOptions={payerOptions}
								categoryOptions={mergedCategoryOptions}
								accountCardValue={accountCardValue}
								payerId={payerId}
								invoicePeriod={invoicePeriod}
								isPaidInvoiceImport={isPaidInvoiceImport}
								paymentAccountId={paymentAccountId}
								paymentDate={paymentDate}
								onAccountCardChange={setAccountCardValue}
								onPayerChange={handleBulkPayerChange}
								onInvoicePeriodChange={setInvoicePeriod}
								onPaymentAccountChange={setPaymentAccountId}
								onPaymentDateChange={setPaymentDate}
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
										) : isPaidInvoiceImport && !paymentAccountId ? (
											<p className="text-muted-foreground text-sm">
												Selecione a conta de pagamento da fatura.
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
										) : canPayImportedInvoiceOnly ? (
											<p className="text-muted-foreground text-sm">
												Lançamentos já importados. Confirme para marcar a fatura
												como paga.
											</p>
										) : null}
										<Button
											onClick={handleRequestImport}
											disabled={!canImport}
											className="w-full sm:w-auto"
										>
											{isPending
												? isPaidInvoiceImport
													? "Processando…"
													: "Importando…"
												: isPaidInvoiceImport
													? canPayImportedInvoiceOnly
														? "Pagar fatura"
														: `Pagar fatura (${importRecordCount} lançamento${importRecordCount !== 1 ? "s" : ""})`
													: `Importar ${importRecordCount} lançamento${importRecordCount !== 1 ? "s" : ""}`}
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
			<ImportConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				importCount={importRecordCount}
				verifiedCount={importSummary.verifiedCount}
				replacedCount={importSummary.replacedCount}
				excludedCount={importSummary.excludedCount}
				installmentBackfillCount={importSummary.installmentBackfillCount}
				isPaidInvoiceImport={isPaidInvoiceImport}
				isPending={isPending}
				onConfirm={handleImport}
			/>
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
			<CreateCategoryInlineDialog
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
			<CreateAccountInlineDialog
				open={accountCreateOpen}
				onOpenChange={(open) => {
					setAccountCreateOpen(open);
					if (!open) {
						setAccountCreateRowIndex(null);
					}
				}}
				onCreated={handleTransferPeerAccountCreated}
			/>
			{linkDialogIndex !== null && rows[linkDialogIndex] ? (
				<ImportLinkDialog
					open={linkDialogIndex !== null}
					onOpenChange={(open) => {
						if (!open) setLinkDialogIndex(null);
					}}
					importedDescription={rows[linkDialogIndex].description}
					importedDate={rows[linkDialogIndex].date}
					importedAmount={rows[linkDialogIndex].amount}
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
