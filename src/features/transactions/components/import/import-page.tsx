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
	CreateCategoryInlineDialog,
	type CreatedCategory,
} from "@/features/categories/components/create-category-inline-dialog";
import type { Category } from "@/features/categories/components/types";
import {
	fetchCategoryMappings,
	saveCategoryMappings,
} from "@/features/transactions/actions/category-memory-action";
import {
	checkDuplicateFitIds,
	deleteImportDuplicateTransaction,
	deleteTransactionByFitId,
	fetchImportDuplicateSnapshots,
	fetchInvoicePeriodDuplicateSnapshots,
	importTransactionsAction,
	undoImportAction,
} from "@/features/transactions/actions/import-action";
import {
	fetchImportBatchHistoryAction,
	getImportBatchResumeAction,
	registerImportUploadAction,
	saveImportBatchDraftAction,
} from "@/features/transactions/actions/import-batch-history-action";
import { fetchTransactionByIdAction } from "@/features/transactions/actions/fetch-by-id";
import {
	fetchTransactionDialogOptionsAction,
	type TransactionDialogOptions,
} from "@/features/transactions/actions/fetch-dialog-options";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import { ImportConfirmDialog } from "@/features/transactions/components/import/import-confirm-dialog";
import { ImportInvoicePeriodMismatchDialog } from "@/features/transactions/components/import/import-invoice-period-mismatch-dialog";
import {
	decodeAccountCard,
	encodeAccountCard,
	GlobalFields,
} from "@/features/transactions/components/import/global-fields";
import { ImportSteps } from "@/features/transactions/components/import/import-steps";
import { ImportSummary } from "@/features/transactions/components/import/import-summary";
import {
	type ReviewRow,
	ReviewTable,
} from "@/features/transactions/components/import/review-table";
import { UploadZone } from "@/features/transactions/components/import/upload-zone";
import { ImportFileHistory } from "@/features/transactions/components/import/import-file-history";
import type { SelectOption, TransactionItem } from "@/features/transactions/components/types";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import {
	applyImportBatchDraftToRows,
	buildImportBatchDraft,
	extractImportBatchDraftGlobals,
	type ImportBatchDraftData,
} from "@/features/transactions/lib/import-batch-draft";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { Button } from "@/shared/components/ui/button";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { CategoryType } from "@/shared/lib/categories/constants";
import type { ImportStatement } from "@/shared/lib/import/types";
import { INVOICE_PAYMENT_CATEGORY_NAME } from "@/shared/lib/categories/constants";
import {
	buildReviewInstallmentImport,
	countImportRecords,
	createManualInstallmentImport,
	createManualRecurrenceImport,
	isValidInstallmentImport,
	isValidRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import {
	resolveInvoicePeriodFromMetadata,
	resolveInvoicePeriodFromStatement,
	resolveImportPaymentDate,
} from "@/features/transactions/lib/import-invoice-period";
import {
	type InvoiceImportContext,
	validateInvoiceImportContext,
} from "@/features/transactions/lib/validate-invoice-import-context";
import {
	buildImportDuplicateValidation,
	type ImportDuplicateValidation,
	findSemanticDuplicateSnapshot,
	isVerifiedImportDuplicate,
} from "@/features/transactions/lib/import-duplicate-match";
import { uploadImportSourceFile } from "@/features/transactions/lib/upload-import-source";
import { parseImportFile } from "@/shared/lib/import/parse-import-file";
import { mapPdfLoadError } from "@/shared/lib/import/pdf-password";
import {
	guessInvoicePaymentCardId,
	guessInvoicePaymentPeriod,
	isInvoicePaymentDescription,
} from "@/features/transactions/lib/import-invoice-payment";
import { getTodayDateString } from "@/shared/utils/date";
import { displayPeriod } from "@/shared/utils/period";

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

const normalizeCategoryName = (value: string) => value.trim().toLowerCase();

function mergeSelectOptions(
	base: SelectOption[],
	extra: SelectOption[],
): SelectOption[] {
	const extraIds = new Set(extra.map((option) => option.value));
	return [
		...base.filter((option) => !extraIds.has(option.value)),
		...extra,
	];
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
	initialCardId?: string | null;
	initialInvoicePeriod?: string | null;
	initialPaymentAccountId?: string | null;
	invoiceContext?: InvoiceImportContext | null;
	linkedCardId?: string | null;
	autoPdfPasswordAttempts?: string[];
	initialImportHistory?: ImportFileHistoryEntry[];
	initialResumeBatchId?: string | null;
}

export function ImportPage({
	payerOptions,
	accountOptions,
	cardOptions,
	categoryOptions,
	defaultPayerId,
	initialCardId = null,
	initialInvoicePeriod = null,
	initialPaymentAccountId = null,
	invoiceContext = null,
	linkedCardId = null,
	autoPdfPasswordAttempts = [],
	initialImportHistory = [],
	initialResumeBatchId = null,
}: ImportPageProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isSavingDraft, startSaveDraftTransition] = useTransition();
	const [isChecking, setIsChecking] = useState(false);
	const [resumingBatchId, setResumingBatchId] = useState<string | null>(null);

	const prefilledAccountCardValue = initialCardId
		? encodeAccountCard("card", initialCardId)
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
	const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
	const [categoryCreateRowIndex, setCategoryCreateRowIndex] = useState<
		number | null
	>(null);
	const [categoryCreateBulk, setCategoryCreateBulk] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
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
	const [awaitingResumeBatch, setAwaitingResumeBatch] = useState<{
		batchId: string;
		sourceFileName: string;
		draftData: ImportBatchDraftData | null;
	} | null>(null);
	const [importHistory, setImportHistory] = useState(initialImportHistory);

	const refreshImportHistory = useCallback(async () => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const historyCardId =
			decoded?.type === "card"
				? decoded.id
				: activeInvoiceContext?.cardId ?? initialCardId ?? null;
		const historyInvoicePeriod =
			invoicePeriod ??
			activeInvoiceContext?.invoicePeriod ??
			initialInvoicePeriod ??
			null;

		const entries = await fetchImportBatchHistoryAction({
			cardId: activeInvoiceContext ? historyCardId : null,
			invoicePeriod: activeInvoiceContext ? historyInvoicePeriod : null,
			limit: 50,
		});
		setImportHistory(entries);
	}, [
		accountCardValue,
		activeInvoiceContext,
		initialCardId,
		initialInvoicePeriod,
		invoicePeriod,
	]);
	const [editTransaction, setEditTransaction] = useState<TransactionItem | null>(
		null,
	);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editDialogOptions, setEditDialogOptions] =
		useState<TransactionDialogOptions | null>(null);

	const importSessionKey = `${initialCardId ?? ""}|${initialInvoicePeriod ?? ""}`;
	const previousSessionKeyRef = useRef(importSessionKey);
	const resumeAttemptedRef = useRef(false);

	const resetImportState = useCallback(() => {
		setStatement(null);
		setRows([]);
		setSourceFile(null);
		setUploadImportBatchId(null);
		setAwaitingResumeBatch(null);
		setFileError(null);
		setPeriodMismatch(null);
		setConfirmOpen(false);
		setIsChecking(false);
		setActiveInvoiceContext(invoiceContext);
		setPayerId(defaultPayerId);
		setAccountCardValue(
			initialCardId ? encodeAccountCard("card", initialCardId) : null,
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
	}, [
		invoiceContext,
		defaultPayerId,
		initialCardId,
		initialInvoicePeriod,
		initialPaymentAccountId,
		accountOptions,
	]);

	useEffect(() => {
		setImportHistory(initialImportHistory);
	}, [initialImportHistory]);

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

	const selectedCardOption = useMemo(() => {
		const decoded = accountCardValue
			? decodeAccountCard(accountCardValue)
			: null;
		const cardId =
			decoded?.type === "card" ? decoded.id : initialCardId ?? null;
		if (!cardId) return null;
		return cardOptions.find((option) => option.value === cardId) ?? null;
	}, [accountCardValue, cardOptions, initialCardId]);

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
			setStatement(stmt);

			const periodFromFile =
				resolveInvoicePeriodFromMetadata(stmt.invoice) ??
				resolveInvoicePeriodFromStatement(
					stmt.invoice,
					stmt.transactions,
					selectedCardOption,
				);
			if (periodFromFile) {
				setInvoicePeriod(periodFromFile);
			}

			setPaymentDate(resolveImportPaymentDate(stmt.invoice));

			const resolvedCardId =
				activeInvoiceContext?.cardId ??
				selectedCardOption?.value ??
				initialCardId ??
				linkedCardId ??
				null;

			const resolvedInvoicePeriod =
				periodFromFile ??
				activeInvoiceContext?.invoicePeriod ??
				initialInvoicePeriod ??
				null;

			setIsChecking(true);

			try {
				const fitIds = stmt.transactions
					.map((t) => t.externalId)
					.filter((id): id is string => id !== null);

				const shouldFetchInvoiceSnapshots =
					stmt.isCreditCard && resolvedCardId && resolvedInvoicePeriod;

				const [
					duplicates,
					categoryMappings,
					duplicateSnapshots,
					invoicePeriodSnapshots,
				] = await Promise.all([
					checkDuplicateFitIds(fitIds).then((ids) => new Set(ids)),
					fetchCategoryMappings(stmt.transactions.map((t) => t.description)),
					fetchImportDuplicateSnapshots(fitIds),
					shouldFetchInvoiceSnapshots
						? fetchInvoicePeriodDuplicateSnapshots(
								resolvedCardId,
								resolvedInvoicePeriod,
							)
						: Promise.resolve([]),
				]);

				const duplicateSnapshotByFitId = new Map(
					duplicateSnapshots.flatMap((snapshot) =>
						snapshot.ofxFitId ? [[snapshot.ofxFitId, snapshot] as const] : [],
					),
				);

				const builtRows = stmt.transactions.map((t) => {
						const isInvoicePayment = isInvoicePaymentDescription(
							t.description,
						);
						const guessedCardId = isInvoicePayment
							? guessInvoicePaymentCardId(t.description, cardOptions)
							: null;
						const guessedPeriod = isInvoicePayment
							? guessInvoicePaymentPeriod(
									t.date,
									cardOptions,
									guessedCardId,
								)
							: null;

						let mappedCategoryId =
							categoryMappings[normalizeDescriptionKey(t.description)] ?? null;

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

						const installmentImport = isInvoicePayment
							? null
							: buildReviewInstallmentImport(t.description);

						let isDuplicate = t.externalId
							? duplicates.has(t.externalId)
							: false;
						let existingSnapshot = t.externalId
							? duplicateSnapshotByFitId.get(t.externalId)
							: undefined;

						if (!isDuplicate && invoicePeriodSnapshots.length > 0) {
							const semanticMatch = findSemanticDuplicateSnapshot(
								{ ...t, installmentImport },
								invoicePeriodSnapshots,
							);
							if (semanticMatch) {
								isDuplicate = true;
								existingSnapshot = semanticMatch;
							}
						}

						const duplicateValidation: ImportDuplicateValidation | null =
							isDuplicate && existingSnapshot
								? buildImportDuplicateValidation(
										{
											...t,
											installmentImport,
										},
										existingSnapshot,
									)
								: null;

						return {
							...t,
							isDuplicate,
							selected: isDuplicate ? false : true,
							duplicateValidation,
							payerId,
							kind: isInvoicePayment
								? ("invoice_payment" as const)
								: ("transaction" as const),
							invoicePaymentCardId: guessedCardId,
							invoicePaymentPeriod: guessedPeriod,
							installmentImport,
							recurrenceImport: null,
							categoryId: isInvoicePayment
								? pagamentosCategoryId
								: isCategoryCompatible(
										mappedCategoryId,
										t.transactionType,
									)
									? mappedCategoryId
									: null,
						};
					});

				const draftData = options?.draftData ?? null;
				const rowsWithDraft = draftData
					? applyImportBatchDraftToRows(builtRows, draftData)
					: builtRows;

				setRows(rowsWithDraft);

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
			initialCardId,
			initialInvoicePeriod,
			isCategoryCompatible,
			linkedCardId,
			payerId,
			categoryOptions,
			cardOptions,
			pagamentosCategoryId,
			selectedCardOption,
		],
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

			const validation = validateInvoiceImportContext(
				stmt,
				activeInvoiceContext,
				cardOptions,
			);

			if (!validation.success) {
				if (validation.reason === "period_mismatch") {
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
				decoded?.type === "card" ? decoded.id : initialCardId ?? null;
			const uploadAccountId =
				decoded?.type === "account" ? decoded.id : null;
			const uploadInvoicePeriod =
				invoicePeriod ??
				activeInvoiceContext?.invoicePeriod ??
				initialInvoicePeriod ??
				null;

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
					const uploadResult = await uploadImportSourceFile({
						file,
						importBatchId: batchId,
						importedCount: 0,
						skippedCount: 0,
						cardId: uploadCardId,
						invoicePeriod: uploadInvoicePeriod,
						accountId: uploadAccountId,
					});

					if (!uploadResult.success) {
						toast.warning(
							uploadResult.error ??
								"O arquivo não foi salvo para retomada posterior.",
						);
					}
				}

				void refreshImportHistory();
			}

			await processParsedStatement(stmt, {
				draftData: options?.draftData ?? null,
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
			processParsedStatement,
			refreshImportHistory,
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
					setAwaitingResumeBatch({
						batchId,
						sourceFileName: result.sourceFileName,
						draftData: result.draftData,
					});
					return;
				}

				const statement = await parseImportFile(file, {
					pdfPasswordCandidates:
						autoPdfPasswordAttempts.length > 0
							? autoPdfPasswordAttempts
							: undefined,
				});

				if (statement.transactions.length === 0) {
					toast.error("Nenhuma transação encontrada no arquivo.");
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
		[autoPdfPasswordAttempts, handleParsed, resumingBatchId],
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

	const handleContinueImportFromHistory = useCallback(
		(entry: ImportFileHistoryEntry) => {
			if (resumingBatchId) return;

			setStatement(null);
			setRows([]);
			setSourceFile(null);
			setFileError(null);
			setPeriodMismatch(null);
			setConfirmOpen(false);

			void resumeImportBatch(entry.id);
		},
		[resumeImportBatch, resumingBatchId],
	);

	useEffect(() => {
		if (!initialResumeBatchId || resumeAttemptedRef.current) return;

		resumeAttemptedRef.current = true;
		void resumeImportBatch(initialResumeBatchId);
	}, [initialResumeBatchId, resumeImportBatch]);

	const handleConfirmPeriodMismatch = useCallback(async () => {
		if (!periodMismatch || !activeInvoiceContext) return;

		const { statement, filePeriod } = periodMismatch;

		setActiveInvoiceContext({
			...activeInvoiceContext,
			invoicePeriod: filePeriod,
		});
		setInvoicePeriod(filePeriod);
		setPeriodMismatch(null);

		await processParsedStatement(statement);
	}, [activeInvoiceContext, periodMismatch, processParsedStatement]);

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
				if (i !== index || isVerifiedImportDuplicate(r)) return r;
				return { ...r, selected: !r.selected };
			}),
		);
	};

	const toggleAll = (selected: boolean) => {
		setRows((prev) =>
			prev.map((r) =>
				isVerifiedImportDuplicate(r) ? { ...r, selected: false } : { ...r, selected },
			),
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
		type: "expense" | "income" | "invoice_payment",
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
					};
				}

				return {
					...row,
					kind: "transaction" as const,
					transactionType: type,
					invoicePaymentCardId: null,
					invoicePaymentPeriod: null,
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

	const handlePayerChange = (index: number, payerId: string | null) => {
		setRows((prev) =>
			prev.map((r, i) => (i === index ? { ...r, payerId } : r)),
		);
	};

	const handleUndoDuplicate = async (index: number) => {
		const row = rows[index];
		if (!row) return;

		const existingTransactionId = row.duplicateValidation?.existingTransactionId;
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

	const handleRecurrenceCountChange = (index: number, recurrenceCount: number) => {
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
		) =>
			category.type === categoryGroupByTransactionType[transactionType];

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
	const isPaidInvoiceImport = Boolean(
		statement?.isCreditCard && statement.invoice?.isPaid,
	);

	const {
		selectedRows,
		duplicateCount,
		duplicateVerifiedCount,
		duplicateMismatchCount,
		uncategorizedCount,
		withoutPayerCount,
		unresolvedInvoicePayments,
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
			uncategorizedCount: selected.filter(
				(r) => r.kind === "transaction" && !r.categoryId,
			).length,
			withoutPayerCount: selected.filter((r) => !r.payerId).length,
			unresolvedInvoicePayments: selected.filter(
				(r) =>
					r.kind === "invoice_payment" &&
					(!r.invoicePaymentCardId || !r.invoicePaymentPeriod),
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

	const importSummary = useMemo(() => {
		const excludedCount = rows.filter((row) => !row.selected).length;
		const replacedCount = selectedRows.filter((row) => row.reimported).length;
		const installmentBackfillCount = selectedRows.reduce((total, row) => {
			if (!isValidInstallmentImport(row.installmentImport)) return total;
			return total + (row.installmentImport.currentInstallment - 1);
		}, 0);

		return {
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
			decoded?.type === "card" ? decoded.id : initialCardId ?? null;
		const period = invoicePeriod ?? initialInvoicePeriod;

		if (!cardId || !period) return null;
		return `/cards/${cardId}/invoice?periodo=${encodeURIComponent(period)}`;
	}, [accountCardValue, initialCardId, initialInvoicePeriod, invoicePeriod]);

	const canImport =
		selectedRows.length > 0 &&
		!!accountCardValue &&
		uncategorizedCount === 0 &&
		withoutPayerCount === 0 &&
		unresolvedInvoicePayments === 0 &&
		invalidInstallmentCount === 0 &&
		invalidRecurrenceCount === 0 &&
		(!isCard || !!invoicePeriod) &&
		(!hasInvoicePayments || accountCardValue.startsWith("account:")) &&
		(!isPaidInvoiceImport || !!paymentAccountId) &&
		!isPending;

	const canSaveDraft =
		!!uploadImportBatchId && rows.length > 0 && !isPending && !isSavingDraft;

	const handleSaveDraft = () => {
		if (!uploadImportBatchId || rows.length === 0) {
			toast.error("Nenhum progresso para salvar.");
			return;
		}

		startSaveDraftTransition(async () => {
			const draftData = buildImportBatchDraft({
				payerId,
				accountCardValue,
				invoicePeriod,
				paymentAccountId,
				paymentDate,
				rows,
			});

			const decoded = accountCardValue
				? decodeAccountCard(accountCardValue)
				: null;
			const cardId = decoded?.type === "card" ? decoded.id : null;
			const accountId = decoded?.type === "account" ? decoded.id : null;

			const result = await saveImportBatchDraftAction({
				batchId: uploadImportBatchId,
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
					entry.id === uploadImportBatchId
						? { ...entry, status: IMPORT_BATCH_STATUS.DRAFT }
						: entry,
				),
			);
		});
	};

	const handleCancelImport = () => {
		if (returnToInvoiceHref) {
			router.push(returnToInvoiceHref);
			return;
		}

		resetImportState();
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
					categoryId: r.categoryId,
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
				? result.skipped > 0
					? `Fatura paga com ${result.imported} lançamentos importados (${result.skipped} duplicatas ignoradas).`
					: `Fatura paga com ${result.imported} lançamento${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""}.`
				: result.skipped > 0
					? `${result.imported} importados, ${result.skipped} duplicatas ignoradas.`
					: `${result.imported} lançamento${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""}.`;

			resetImportState();
			router.push(returnToInvoiceHref ?? "/transactions");

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
		});
	};

	const handleRequestImport = () => {
		if (!canImport) return;
		setConfirmOpen(true);
	};

	const currentStep = !statement ? "upload" : isPending ? "done" : "review";

	const cardTitle = activeInvoiceContext
		? isPaidInvoiceImport
			? "Pagar fatura"
			: "Revisar fatura"
		: "Importar extrato";

	const cardDescription = activeInvoiceContext
		? isPaidInvoiceImport
			? `Confira os lançamentos e confirme o pagamento da fatura de ${displayPeriod(activeInvoiceContext.invoicePeriod)} do cartão ${activeInvoiceContext.cardName}.`
			: `Revise os lançamentos da fatura de ${displayPeriod(activeInvoiceContext.invoicePeriod)} do cartão ${activeInvoiceContext.cardName} antes de importar.`
		: "Importe transações a partir de extratos ou faturas (.ofx, .csv, .txt, .pdf) ou planilha .xlsx exportada pelo seu banco.";

	const importHistoryTitle = activeInvoiceContext
		? `Importações desta fatura (${displayPeriod(activeInvoiceContext.invoicePeriod)})`
		: "Importações recentes";

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 space-y-1">
						<CardTitle>{cardTitle}</CardTitle>
						<CardDescription>{cardDescription}</CardDescription>
					</div>
					<ImportSteps current={currentStep} className="shrink-0" />
				</div>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-6">
					{!statement || isChecking ? (
						<>
							{!statement && (
								<div className="flex flex-col gap-3 md:gap-4">
									{awaitingResumeBatch ? (
										<Alert>
											<AlertTitle>Reprocessar importação</AlertTitle>
											<AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
												<span>
													O arquivo{" "}
													<span className="font-medium text-foreground">
														{awaitingResumeBatch.sourceFileName}
													</span>{" "}
													não está salvo no servidor. Selecione o mesmo arquivo na
													área abaixo para continuar esta importação.
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
										importHistory={importHistory}
										resumeBatchId={awaitingResumeBatch?.batchId ?? null}
									/>
									<ImportFileHistory
										entries={importHistory}
										title={importHistoryTitle}
										compact
										limit={10}
										viewAllHref="/transactions/import/history"
										onContinueImport={handleContinueImportFromHistory}
										resumingBatchId={resumingBatchId}
										description={
											activeInvoiceContext
												? "Arquivos já enviados para esta fatura. Reprocessar não cria entrada nova — só um novo upload registra outro item. O sistema avisa se você tentar enviar o mesmo arquivo de novo."
												: "Arquivos importados recentemente nesta conta. Reprocessar reutiliza o registro existente."
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
								total={rows.length}
								selected={selectedRows.length}
								duplicates={duplicateCount}
								duplicateVerified={duplicateVerifiedCount}
								duplicateMismatch={duplicateMismatchCount}
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

							<ReviewTable
								rows={rows}
								payerOptions={payerOptions}
								categoryOptions={mergedCategoryOptions}
								cardOptions={cardOptions}
								isCard={isCard}
								invoicePeriod={invoicePeriod}
								onToggle={toggleRow}
								onToggleAll={toggleAll}
								onPayerChange={handlePayerChange}
								onCategoryChange={handleCategoryChange}
								onCreateCategory={handleRequestCreateCategory}
								onRowTypeChange={handleRowTypeChange}
								onInvoicePaymentCardChange={handleInvoicePaymentCardChange}
								onInvoicePaymentPeriodChange={handleInvoicePaymentPeriodChange}
								onDescriptionChange={handleDescriptionChange}
								onInstallmentToggle={handleInstallmentToggle}
								onInstallmentCountChange={handleInstallmentCountChange}
								onInstallmentCurrentChange={handleInstallmentCurrentChange}
								onUndoDuplicate={handleUndoDuplicate}
								onEditDuplicate={handleEditDuplicate}
								onConvertToInstallment={handleConvertToInstallment}
								onConvertToRecurrence={handleConvertToRecurrence}
								onRecurrenceToggle={handleRecurrenceToggle}
								onRecurrenceCountChange={handleRecurrenceCountChange}
							/>

							{/* Sticky footer */}
							<div className="sticky bottom-0 -mx-6 bg-card px-6 pt-3 pb-1">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
										<Button
											type="button"
											variant="outline"
											className="w-full sm:w-auto"
											onClick={handleCancelImport}
											disabled={isPending || isSavingDraft}
										>
											Cancelar
										</Button>
										<Button
											type="button"
											variant="outline"
											className="w-full sm:w-auto"
											onClick={handleSaveDraft}
											disabled={!canSaveDraft}
										>
											<RiSaveLine className="size-4" aria-hidden />
											{isSavingDraft ? "Salvando…" : "Continuar depois"}
										</Button>
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
													? `Pagar fatura (${importRecordCount} lançamento${importRecordCount !== 1 ? "s" : ""})`
													: `Importar ${importRecordCount} lançamento${importRecordCount !== 1 ? "s" : ""}`}
										</Button>
									</div>
								</div>
							</div>
						</>
					)}
				</div>
			</CardContent>
			<ImportConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				importCount={importRecordCount}
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
