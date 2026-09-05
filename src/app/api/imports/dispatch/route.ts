import { NextResponse } from "next/server";
import {
	fetchCardLimitsAction,
	updateCardLimitsFromInvoiceAction,
} from "@/features/transactions/actions/card-limits";
import {
	fetchImportDescriptionMemory,
	saveCategoryMappings,
} from "@/features/transactions/actions/category-memory-action";
import {
	analyzeImportAiBatchAction,
	prepareImportAiAnalysisAction,
} from "@/features/transactions/actions/import-ai-analysis-action";
import {
	checkDuplicateFitIds,
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
import {
	fetchImportBatchHistoryAction,
	getImportBatchDraftAction,
	getImportBatchResumeAction,
	registerImportUploadAction,
	saveImportBatchDraftAction,
	syncImportBatchContextAction,
	syncImportBatchSourceTotalAction,
} from "@/features/transactions/actions/import-batch-history-action";
import { matchInvoicePaymentsByAmountAction } from "@/features/transactions/actions/invoice-payment-match";
import {
	fetchInvoiceSnapshotAction,
	updatePreviousInvoicePaymentDateAction,
} from "@/features/transactions/actions/previous-invoice-snapshot";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type DispatchBody = {
	operation?: string;
	payload?: unknown;
};

function hasSuccessBoolean(
	value: unknown,
): value is { success: boolean; [key: string]: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		"success" in value &&
		typeof (value as { success: unknown }).success === "boolean"
	);
}

function formatDispatchResponse(result: unknown) {
	if (hasSuccessBoolean(result)) {
		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	}

	if (Array.isArray(result)) {
		return NextResponse.json(result);
	}

	return NextResponse.json({ success: true, data: result });
}

const dispatchHandlers: Record<
	string,
	(payload: unknown) => Promise<unknown>
> = {
	fetchImportBatchHistory: (payload) =>
		fetchImportBatchHistoryAction(
			(payload ?? {}) as Parameters<typeof fetchImportBatchHistoryAction>[0],
		),
	registerImportUpload: (payload) =>
		registerImportUploadAction(
			payload as Parameters<typeof registerImportUploadAction>[0],
		),
	syncImportBatchContext: (payload) =>
		syncImportBatchContextAction(
			payload as Parameters<typeof syncImportBatchContextAction>[0],
		),
	syncImportBatchSourceTotal: (payload) =>
		syncImportBatchSourceTotalAction(
			payload as Parameters<typeof syncImportBatchSourceTotalAction>[0],
		),
	getImportBatchDraft: (payload) =>
		getImportBatchDraftAction(
			payload as Parameters<typeof getImportBatchDraftAction>[0],
		),
	getImportBatchResume: (payload) =>
		getImportBatchResumeAction(
			payload as Parameters<typeof getImportBatchResumeAction>[0],
		),
	saveImportBatchDraft: (payload) =>
		saveImportBatchDraftAction(
			payload as Parameters<typeof saveImportBatchDraftAction>[0],
		),
	checkDuplicateFitIds: (payload) =>
		checkDuplicateFitIds(payload as string[]),
	fetchImportDuplicateSnapshots: (payload) =>
		fetchImportDuplicateSnapshots(payload as string[]),
	fetchInvoicePeriodDuplicateSnapshots: (payload) => {
		const input = payload as { cardId: string; invoicePeriod: string };
		return fetchInvoicePeriodDuplicateSnapshots(
			input.cardId,
			input.invoicePeriod,
		);
	},
	fetchCardInstallmentDuplicateSnapshots: (payload) =>
		fetchCardInstallmentDuplicateSnapshots(payload as string),
	fetchAccountImportDuplicateSnapshots: (payload) => {
		const input = payload as {
			accountId: string;
			dateFrom: string;
			dateTo: string;
		};
		return fetchAccountImportDuplicateSnapshots(
			input.accountId,
			input.dateFrom,
			input.dateTo,
		);
	},
	linkImportSuggestionsBatch: (payload) =>
		linkImportSuggestionsBatchAction(
			payload as Parameters<typeof linkImportSuggestionsBatchAction>[0],
		),
	moveImportTransactionToPeriod: (payload) =>
		moveImportTransactionToPeriodAction(
			payload as Parameters<typeof moveImportTransactionToPeriodAction>[0],
		),
	updateImportExistingTransactionCategory: (payload) =>
		updateImportExistingTransactionCategoryAction(
			payload as Parameters<
				typeof updateImportExistingTransactionCategoryAction
			>[0],
		),
	deleteImportDuplicateTransaction: (payload) =>
		deleteImportDuplicateTransaction(payload as string),
	deleteTransactionByFitId: (payload) =>
		deleteTransactionByFitId(payload as string),
	previewImportBalanceReconciliation: (payload) =>
		previewImportBalanceReconciliationAction(
			payload as Parameters<typeof previewImportBalanceReconciliationAction>[0],
		),
	importTransactions: (payload) =>
		importTransactionsAction(
			payload as Parameters<typeof importTransactionsAction>[0],
		),
	undoImport: (payload) => undoImportAction(payload as string),
	prepareImportAiAnalysis: (payload) =>
		prepareImportAiAnalysisAction(
			payload as Parameters<typeof prepareImportAiAnalysisAction>[0],
		),
	analyzeImportAiBatch: (payload) =>
		analyzeImportAiBatchAction(
			payload as Parameters<typeof analyzeImportAiBatchAction>[0],
		),
	matchInvoicePaymentsByAmount: (payload) =>
		matchInvoicePaymentsByAmountAction(
			payload as Parameters<typeof matchInvoicePaymentsByAmountAction>[0],
		),
	fetchInvoiceSnapshot: (payload) =>
		fetchInvoiceSnapshotAction(
			payload as Parameters<typeof fetchInvoiceSnapshotAction>[0],
		),
	updatePreviousInvoicePaymentDate: (payload) =>
		updatePreviousInvoicePaymentDateAction(
			payload as Parameters<typeof updatePreviousInvoicePaymentDateAction>[0],
		),
	fetchCardLimits: (payload) => fetchCardLimitsAction(payload as string),
	updateCardLimitsFromInvoice: (payload) =>
		updateCardLimitsFromInvoiceAction(
			payload as Parameters<typeof updateCardLimitsFromInvoiceAction>[0],
		),
	fetchImportDescriptionMemory: (payload) =>
		fetchImportDescriptionMemory(payload as string[]),
	saveCategoryMappings: (payload) =>
		saveCategoryMappings(
			payload as Parameters<typeof saveCategoryMappings>[0],
		).then(() => ({ success: true as const })),
};

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const body = (await request.json()) as DispatchBody;
		const handler = body.operation
			? dispatchHandlers[body.operation]
			: undefined;

		if (!handler) {
			return NextResponse.json(
				{ success: false, error: "Operação inválida." },
				{ status: 400 },
			);
		}

		const result = await handler(body.payload);
		return formatDispatchResponse(result);
	} catch (error) {
		const result = handleActionError(error);
		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	}
}
