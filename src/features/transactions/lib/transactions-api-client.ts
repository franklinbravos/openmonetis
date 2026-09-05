import type { TransactionDialogOptions } from "@/features/transactions/actions/fetch-dialog-options";
import type { InstallmentSeriesOccurrence } from "@/features/transactions/actions/installment-series";
import type { TransactionItem } from "@/features/transactions/components/types";
import type { TransactionsExportContext } from "@/features/transactions/lib/export-types";
import {
	fetchActionResult,
	fetchJsonData,
	getApiOrigin,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { EligibleInstallment } from "@/shared/lib/installments/anticipation-types";
import type { ActionResult } from "@/shared/lib/types/actions";

type FetchTransactionsByIdsResponse = {
	success: true;
	items: TransactionItem[];
};

type PresignSuccess = {
	success: true;
	presignedUrl: string;
	fileKey: string;
	uploadToken: string;
};

type PresignFailure = { success: false; error: string };

export type PresignUploadResult = PresignSuccess | PresignFailure;

async function transactionsBulkClient<T = void>(
	operation: string,
	payload: Record<string, unknown>,
): Promise<ActionResult<T>> {
	return fetchActionResult<T>("/api/transactions/bulk", {
		method: "POST",
		...jsonRequestBody({ operation, ...payload }),
	});
}

export async function fetchTransactionsByIdsClient(
	ids: string[],
): Promise<TransactionItem[]> {
	const uniqueIds = [...new Set(ids.filter(Boolean))];
	if (uniqueIds.length === 0) {
		return [];
	}

	const payload = await fetchJsonData<FetchTransactionsByIdsResponse>(
		"/api/transactions/by-ids",
		{
			method: "POST",
			...jsonRequestBody({ ids: uniqueIds }),
		},
		"Não foi possível carregar os lançamentos.",
	);

	return payload.items;
}

export async function fetchTransactionByIdClient(
	transactionId: string,
): Promise<TransactionItem | null> {
	const items = await fetchTransactionsByIdsClient([transactionId]);
	return items[0] ?? null;
}

export async function fetchTransactionDialogOptionsClient(): Promise<TransactionDialogOptions> {
	return fetchJsonData<TransactionDialogOptions>(
		"/api/transactions/dialog-options",
		undefined,
		"Não foi possível carregar as opções do formulário.",
	);
}

export async function createTransactionClient(
	input: unknown,
): Promise<ActionResult<{ ids: string[] }>> {
	return fetchActionResult<{ ids: string[] }>("/api/transactions", {
		method: "POST",
		...jsonRequestBody(input),
	});
}

export async function updateTransactionClient(
	transactionId: string,
	input: unknown,
): Promise<ActionResult> {
	return fetchActionResult(`/api/transactions/${transactionId}`, {
		method: "PATCH",
		...jsonRequestBody(input),
	});
}

export async function deleteTransactionClient(
	transactionId: string,
): Promise<ActionResult> {
	return fetchActionResult(`/api/transactions/${transactionId}`, {
		method: "DELETE",
	});
}

export async function toggleTransactionSettlementClient(
	transactionId: string,
	input: Omit<Record<string, unknown>, "id">,
): Promise<ActionResult> {
	return fetchActionResult(`/api/transactions/${transactionId}/settlement`, {
		method: "POST",
		...jsonRequestBody(input),
	});
}

export async function convertTransactionToInstallmentClient(
	transactionId: string,
	input: { installmentCount: number },
): Promise<ActionResult<{ createdCount: number }>> {
	return fetchActionResult<{ createdCount: number }>(
		`/api/transactions/${transactionId}/convert-installment`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
	);
}

export async function convertTransactionToRecurringClient(
	transactionId: string,
	input: { recurrenceCount: number },
): Promise<ActionResult<{ createdCount: number }>> {
	return fetchActionResult<{ createdCount: number }>(
		`/api/transactions/${transactionId}/convert-recurring`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
	);
}

export async function updateTransactionSplitPairClient(
	transactionId: string,
	input: unknown,
): Promise<ActionResult> {
	return fetchActionResult(`/api/transactions/${transactionId}/split-pair`, {
		method: "PATCH",
		...jsonRequestBody(input),
	});
}

export async function deleteTransactionBulkClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return transactionsBulkClient("deleteBulk", input);
}

export async function updateTransactionBulkClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return transactionsBulkClient("updateBulk", input);
}

export async function createMassTransactionsClient(
	input: unknown,
): Promise<ActionResult> {
	return transactionsBulkClient("massCreate", input as Record<string, unknown>);
}

export async function deleteMultipleTransactionsClient(input: {
	ids: string[];
}): Promise<ActionResult> {
	return transactionsBulkClient("deleteMultiple", input);
}

export async function detachAttachmentBulkClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return transactionsBulkClient("detachAttachments", input);
}

export async function getPresignedUploadUrlClient(
	transactionId: string,
	input: { fileName: string; mimeType: string; fileSize: number },
): Promise<PresignUploadResult> {
	const response = await fetch(
		`${getApiOrigin()}/api/transactions/${transactionId}/attachments/presign`,
		{
			method: "POST",
			credentials: "include",
			...jsonRequestBody(input),
		},
	);

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error("Não foi possível preparar o upload do anexo.");
	}

	return (await response.json()) as PresignUploadResult;
}

export async function confirmAttachmentUploadClient(
	transactionId: string,
	input: {
		uploadToken: string;
		scope?: "current" | "period" | "future" | "all";
	},
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/transactions/${transactionId}/attachments/confirm`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
	);
}

export async function detachTransactionAttachmentClient(
	transactionId: string,
	attachmentId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/transactions/${transactionId}/attachments/${attachmentId}`,
		{ method: "DELETE" },
	);
}

export async function refundTransactionClient(
	transactionId: string,
	input: { refundDate: string; refundPeriod: string },
): Promise<ActionResult<{ refundId: string }>> {
	return fetchActionResult<{ refundId: string }>(
		`/api/transactions/${transactionId}/refund`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
	);
}

export async function createInstallmentAnticipationClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return fetchActionResult("/api/transactions/installments/anticipations", {
		method: "POST",
		...jsonRequestBody(input),
	});
}

export async function cancelInstallmentAnticipationClient(
	anticipationId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/transactions/installments/anticipations/${anticipationId}`,
		{ method: "DELETE" },
	);
}

export async function getEligibleInstallmentsClient(
	seriesId: string,
	anticipationPeriod: string,
): Promise<ActionResult<EligibleInstallment[]>> {
	const params = new URLSearchParams({ anticipationPeriod });
	return fetchActionResult<EligibleInstallment[]>(
		`/api/transactions/installments/${seriesId}/eligible?${params}`,
	);
}

export async function fetchInstallmentSeriesClient(
	seriesId: string,
): Promise<InstallmentSeriesOccurrence[]> {
	return fetchJsonData<InstallmentSeriesOccurrence[]>(
		`/api/transactions/installments/${seriesId}`,
		undefined,
		"Não foi possível carregar a série de parcelas.",
	);
}

export async function exportTransactionsDataClient(
	input: TransactionsExportContext,
): Promise<ActionResult<{ transactions: TransactionItem[] }>> {
	return fetchActionResult<{ transactions: TransactionItem[] }>(
		"/api/transactions/export",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
	);
}
