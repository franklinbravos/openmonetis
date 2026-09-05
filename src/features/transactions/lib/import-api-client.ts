import type { CardLimitsSnapshot } from "@/features/transactions/actions/card-limits";
import type { ImportDescriptionMemory } from "@/features/transactions/actions/category-memory-action";
import type {
	AnalyzeImportAiBatchResult,
	PrepareImportAiAnalysisResult,
} from "@/features/transactions/actions/import-ai-analysis-action";
import type {
	deleteImportDuplicateTransaction,
	deleteTransactionByFitId,
	fetchAccountImportDuplicateSnapshots,
	fetchCardInstallmentDuplicateSnapshots,
	fetchImportDuplicateSnapshots,
	fetchInvoicePeriodDuplicateSnapshots,
	importTransactionsAction,
	linkImportSuggestionsBatchAction,
	moveImportTransactionToPeriodAction,
	previewImportBalanceReconciliationAction,
	undoImportAction,
	updateImportExistingTransactionCategoryAction,
} from "@/features/transactions/actions/import-action";
import type {
	fetchImportBatchHistoryAction,
	getImportBatchDraftAction,
	getImportBatchResumeAction,
	registerImportUploadAction,
	saveImportBatchDraftAction,
	syncImportBatchContextAction,
	syncImportBatchSourceTotalAction,
} from "@/features/transactions/actions/import-batch-history-action";
import type { InvoicePaymentMatchInput } from "@/features/transactions/actions/invoice-payment-match";
import type { InvoiceSnapshot } from "@/features/transactions/actions/previous-invoice-snapshot";
import type { updatePreviousInvoicePaymentDateAction } from "@/features/transactions/actions/previous-invoice-snapshot";
import type { updateCardLimitsFromInvoiceAction } from "@/features/transactions/actions/card-limits";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import type { ImportStatement } from "@/shared/lib/import/types";
import {
	fetchActionResult,
	fetchJsonData,
	getApiOrigin,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";

const IMPORT_DISPATCH_PATH = "/api/imports/dispatch";

async function importDispatch(
	operation: string,
	payload?: unknown,
	fallbackMessage = "Algo deu errado.",
): Promise<unknown> {
	const response = await fetch(`${getApiOrigin()}${IMPORT_DISPATCH_PATH}`, {
		method: "POST",
		credentials: "include",
		...jsonRequestBody({ operation, payload }),
	});

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error(fallbackMessage);
	}

	return response.json();
}

async function importDispatchArray<T>(
	operation: string,
	payload?: unknown,
	fallbackMessage = "Algo deu errado.",
): Promise<T> {
	return fetchJsonData<T>(
		IMPORT_DISPATCH_PATH,
		{
			method: "POST",
			...jsonRequestBody({ operation, payload }),
		},
		fallbackMessage,
	);
}

async function importDispatchData<T>(
	operation: string,
	payload?: unknown,
	fallbackMessage = "Algo deu errado.",
): Promise<T> {
	const result = (await importDispatch(operation, payload, fallbackMessage)) as {
		success?: boolean;
		data?: T;
		error?: string;
	};

	if (result.success === false) {
		throw new Error(result.error ?? fallbackMessage);
	}

	return result.data as T;
}

type ParseImportPdfSuccess = {
	success: true;
	statement: ImportStatement;
	logs: string[];
};

type ParseImportPdfFailure = {
	success: false;
	error: string;
	errorName?: string;
	logs: string[];
};

export type ParseImportPdfResult = ParseImportPdfSuccess | ParseImportPdfFailure;

type DownloadUrlSuccess = {
	success: true;
	url: string;
	fileName: string;
};

type DownloadUrlFailure = { success: false; error: string };

export type ImportDownloadUrlResult = DownloadUrlSuccess | DownloadUrlFailure;

export async function deleteImportBatchClient(batchId: string): Promise<{
	success: boolean;
	error?: string;
	message?: string;
}> {
	const response = await fetch(`${getApiOrigin()}/api/imports/batches/${batchId}`, {
		method: "DELETE",
		credentials: "include",
	});
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Não foi possível remover o lote de importação.");
	}
	return (await response.json()) as {
		success: boolean;
		error?: string;
		message?: string;
	};
}

export async function cloneImportBatchForReprocessClient(
	batchId: string,
): Promise<
	{ success: true; importBatchId: string } | { success: false; error: string }
> {
	const response = await fetch(
		`${getApiOrigin()}/api/imports/batches/${batchId}/reprocess`,
		{ method: "POST", credentials: "include" },
	);
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Não foi possível reprocessar o lote de importação.");
	}
	return (await response.json()) as
		| { success: true; importBatchId: string }
		| { success: false; error: string };
}

export async function getImportBatchDownloadUrlClient(
	batchId: string,
): Promise<ImportDownloadUrlResult> {
	const response = await fetch(
		`${getApiOrigin()}/api/imports/batches/${batchId}/download`,
		{ method: "POST", credentials: "include" },
	);
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Não foi possível gerar o link de download.");
	}
	return (await response.json()) as ImportDownloadUrlResult;
}

export async function getImportSourceDownloadUrlClient(input: {
	cardId: string;
	invoicePeriod: string;
}): Promise<ImportDownloadUrlResult> {
	const response = await fetch(`${getApiOrigin()}/api/imports/source-download`, {
		method: "POST",
		credentials: "include",
		...jsonRequestBody(input),
	});
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Não foi possível gerar o link de download.");
	}
	return (await response.json()) as ImportDownloadUrlResult;
}

export async function saveCardImportPdfPasswordClient(
	cardId: string,
	input: { rule: string; secret: string | null },
): Promise<{ success: boolean; message?: string; error?: string }> {
	return fetchActionResult(`/api/cards/${cardId}/import-pdf-password`, {
		method: "POST",
		...jsonRequestBody(input),
	});
}

export async function fetchCardImportPdfPasswordAttemptsClient(
	cardId: string,
): Promise<
	{ success: true; attempts: string[] } | { success: false; error: string }
> {
	return fetchJsonData<{ success: true; attempts: string[] }>(
		`/api/cards/${cardId}/import-pdf-password-attempts`,
		undefined,
		"Não foi possível carregar as tentativas de senha.",
	);
}

export async function parseImportPdfClient(
	formData: FormData,
): Promise<ParseImportPdfResult> {
	const response = await fetch(`${getApiOrigin()}/api/imports/parse-pdf`, {
		method: "POST",
		credentials: "include",
		body: formData,
	});
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Não foi possível processar o PDF.");
	}
	return (await response.json()) as ParseImportPdfResult;
}

export async function uploadImportSourceFileClient(
	formData: FormData,
): Promise<{ success: boolean; error?: string }> {
	const response = await fetch(`${getApiOrigin()}/api/imports/upload-source`, {
		method: "POST",
		credentials: "include",
		body: formData,
	});
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Erro ao enviar o arquivo original.");
	}
	return (await response.json()) as { success: boolean; error?: string };
}

export async function fetchImportBatchHistoryClient(
	input: Parameters<typeof fetchImportBatchHistoryAction>[0] = {},
): Promise<ImportFileHistoryEntry[]> {
	return importDispatchArray("fetchImportBatchHistory", input);
}

export async function registerImportUploadClient(
	input: Parameters<typeof registerImportUploadAction>[0],
): Promise<Awaited<ReturnType<typeof registerImportUploadAction>>> {
	return importDispatch("registerImportUpload", input) as Promise<
		Awaited<ReturnType<typeof registerImportUploadAction>>
	>;
}

export async function syncImportBatchContextClient(
	input: Parameters<typeof syncImportBatchContextAction>[0],
): Promise<Awaited<ReturnType<typeof syncImportBatchContextAction>>> {
	return importDispatch("syncImportBatchContext", input) as Promise<
		Awaited<ReturnType<typeof syncImportBatchContextAction>>
	>;
}

export async function syncImportBatchSourceTotalClient(
	input: Parameters<typeof syncImportBatchSourceTotalAction>[0],
): Promise<Awaited<ReturnType<typeof syncImportBatchSourceTotalAction>>> {
	return importDispatch("syncImportBatchSourceTotal", input) as Promise<
		Awaited<ReturnType<typeof syncImportBatchSourceTotalAction>>
	>;
}

export async function getImportBatchDraftClient(input: {
	batchId: string;
}): Promise<Awaited<ReturnType<typeof getImportBatchDraftAction>>> {
	return importDispatch("getImportBatchDraft", input) as Promise<
		Awaited<ReturnType<typeof getImportBatchDraftAction>>
	>;
}

export async function getImportBatchResumeClient(input: {
	batchId: string;
}): Promise<Awaited<ReturnType<typeof getImportBatchResumeAction>>> {
	return importDispatch("getImportBatchResume", input) as Promise<
		Awaited<ReturnType<typeof getImportBatchResumeAction>>
	>;
}

export async function saveImportBatchDraftClient(
	input: Parameters<typeof saveImportBatchDraftAction>[0],
): Promise<Awaited<ReturnType<typeof saveImportBatchDraftAction>>> {
	return importDispatch("saveImportBatchDraft", input) as Promise<
		Awaited<ReturnType<typeof saveImportBatchDraftAction>>
	>;
}

export async function checkDuplicateFitIdsClient(
	fitIds: string[],
): Promise<string[]> {
	return importDispatchArray("checkDuplicateFitIds", fitIds);
}

export async function fetchImportDuplicateSnapshotsClient(fitIds: string[]) {
	return importDispatchArray<
		Awaited<ReturnType<typeof fetchImportDuplicateSnapshots>>
	>("fetchImportDuplicateSnapshots", fitIds);
}

export async function fetchInvoicePeriodDuplicateSnapshotsClient(
	cardId: string,
	invoicePeriod: string,
) {
	return importDispatchArray<
		Awaited<ReturnType<typeof fetchInvoicePeriodDuplicateSnapshots>>
	>("fetchInvoicePeriodDuplicateSnapshots", { cardId, invoicePeriod });
}

export async function fetchCardInstallmentDuplicateSnapshotsClient(
	cardId: string,
) {
	return importDispatchArray<
		Awaited<ReturnType<typeof fetchCardInstallmentDuplicateSnapshots>>
	>("fetchCardInstallmentDuplicateSnapshots", cardId);
}

export async function fetchAccountImportDuplicateSnapshotsClient(
	accountId: string,
	dateFrom: string,
	dateTo: string,
) {
	return importDispatchArray<
		Awaited<ReturnType<typeof fetchAccountImportDuplicateSnapshots>>
	>("fetchAccountImportDuplicateSnapshots", {
		accountId,
		dateFrom,
		dateTo,
	});
}

export async function linkImportSuggestionsBatchClient(
	input: Parameters<typeof linkImportSuggestionsBatchAction>[0],
): Promise<Awaited<ReturnType<typeof linkImportSuggestionsBatchAction>>> {
	return importDispatch("linkImportSuggestionsBatch", input) as Promise<
		Awaited<ReturnType<typeof linkImportSuggestionsBatchAction>>
	>;
}

export async function moveImportTransactionToPeriodClient(
	input: Parameters<typeof moveImportTransactionToPeriodAction>[0],
): Promise<Awaited<ReturnType<typeof moveImportTransactionToPeriodAction>>> {
	return importDispatch("moveImportTransactionToPeriod", input) as Promise<
		Awaited<ReturnType<typeof moveImportTransactionToPeriodAction>>
	>;
}

export async function updateImportExistingTransactionCategoryClient(
	input: Parameters<typeof updateImportExistingTransactionCategoryAction>[0],
): Promise<
	Awaited<ReturnType<typeof updateImportExistingTransactionCategoryAction>>
> {
	return importDispatch(
		"updateImportExistingTransactionCategory",
		input,
	) as Promise<
		Awaited<ReturnType<typeof updateImportExistingTransactionCategoryAction>>
	>;
}

export async function deleteImportDuplicateTransactionClient(
	transactionId: string,
): Promise<Awaited<ReturnType<typeof deleteImportDuplicateTransaction>>> {
	return importDispatch(
		"deleteImportDuplicateTransaction",
		transactionId,
	) as Promise<Awaited<ReturnType<typeof deleteImportDuplicateTransaction>>>;
}

export async function deleteTransactionByFitIdClient(fitId: string) {
	return importDispatch("deleteTransactionByFitId", fitId) as Promise<
		Awaited<ReturnType<typeof deleteTransactionByFitId>>
	>;
}

export async function previewImportBalanceReconciliationClient(
	input: Parameters<typeof previewImportBalanceReconciliationAction>[0],
): Promise<
	Awaited<ReturnType<typeof previewImportBalanceReconciliationAction>>
> {
	return importDispatch("previewImportBalanceReconciliation", input) as Promise<
		Awaited<ReturnType<typeof previewImportBalanceReconciliationAction>>
	>;
}

export async function importTransactionsClient(
	input: Parameters<typeof importTransactionsAction>[0],
): Promise<Awaited<ReturnType<typeof importTransactionsAction>>> {
	return importDispatch("importTransactions", input) as Promise<
		Awaited<ReturnType<typeof importTransactionsAction>>
	>;
}

export async function undoImportClient(importBatchId: string) {
	return importDispatch("undoImport", importBatchId) as Promise<
		Awaited<ReturnType<typeof undoImportAction>>
	>;
}

export async function prepareImportAiAnalysisClient(
	input: Parameters<
		typeof import("../actions/import-ai-analysis-action").prepareImportAiAnalysisAction
	>[0],
): Promise<PrepareImportAiAnalysisResult> {
	return importDispatch("prepareImportAiAnalysis", input) as Promise<
		PrepareImportAiAnalysisResult
	>;
}

export async function analyzeImportAiBatchClient(
	input: Parameters<
		typeof import("../actions/import-ai-analysis-action").analyzeImportAiBatchAction
	>[0],
): Promise<AnalyzeImportAiBatchResult> {
	return importDispatch("analyzeImportAiBatch", input) as Promise<
		AnalyzeImportAiBatchResult
	>;
}

export async function matchInvoicePaymentsByAmountClient(
	payments: InvoicePaymentMatchInput[],
) {
	return importDispatchData<
		Awaited<
			ReturnType<
				typeof import("../actions/invoice-payment-match").matchInvoicePaymentsByAmountAction
			>
		>
	>("matchInvoicePaymentsByAmount", payments);
}

export async function fetchInvoiceSnapshotClient(input: {
	cardId: string;
	period: string;
}): Promise<InvoiceSnapshot | null> {
	return importDispatchData<InvoiceSnapshot | null>(
		"fetchInvoiceSnapshot",
		input,
	);
}

export async function updatePreviousInvoicePaymentDateClient(input: {
	transactionId: string;
	paymentDate: string;
}) {
	return importDispatch("updatePreviousInvoicePaymentDate", input) as Promise<
		Awaited<ReturnType<typeof updatePreviousInvoicePaymentDateAction>>
	>;
}

export async function fetchCardLimitsClient(
	cardId: string,
): Promise<CardLimitsSnapshot | null> {
	return importDispatchData<CardLimitsSnapshot | null>(
		"fetchCardLimits",
		cardId,
	);
}

export async function updateCardLimitsFromInvoiceClient(input: {
	cardId: string;
	limit: number;
	guaranteedLimit: number | null;
}) {
	return importDispatch("updateCardLimitsFromInvoice", input) as Promise<
		Awaited<ReturnType<typeof updateCardLimitsFromInvoiceAction>>
	>;
}

export async function fetchImportDescriptionMemoryClient(
	descriptions: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	return importDispatchData<Record<string, ImportDescriptionMemory>>(
		"fetchImportDescriptionMemory",
		descriptions,
	);
}

export async function saveCategoryMappingsClient(
	rows: Parameters<
		typeof import("../actions/category-memory-action").saveCategoryMappings
	>[0],
) {
	return importDispatch("saveCategoryMappings", rows) as Promise<{
		success: true;
	}>;
}
