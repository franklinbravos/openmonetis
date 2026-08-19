import { and, desc, eq } from "drizzle-orm";
import { attachments, importBatches, transactions } from "@/db/schema";
import { INVOICE_ADJUSTMENT_NAME } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import {
	findRegisteredRowsMissingFromFile,
	parseStoredSourceFileRows,
	sourceFileRowsFromStatement,
} from "@/shared/lib/import/invoice-file-match";
import {
	resolveInvoiceClosingTarget,
	roundMoney,
} from "@/shared/lib/import/invoice-total";
import { parseImportFileFromBuffer } from "@/shared/lib/import/parse-import-file-buffer";
import type { InvoiceSourceTotalKind } from "@/shared/lib/import/types";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getS3ObjectBuffer } from "@/shared/lib/storage/presign";
import { callRpcOne } from "@/shared/lib/supabase/rpc";
import { safeToNumber as toNumber } from "@/shared/utils/number";

type InvoiceTotalRow = {
	total: string | number | null;
};

export type InvoiceReconciliationTransaction = {
	id: string;
	name: string;
	amount: number;
	purchaseDate: Date;
	importBatchId: string | null;
	group: "last_import" | "adjustment" | "extra";
};

export type InvoiceReconciliationData = {
	registeredTotal: number;
	sourceTotal: number | null;
	sourceKind: InvoiceSourceTotalKind | null;
	sourceOverride: boolean;
	lastImportBatchId: string | null;
	delta: number | null;
	/** Total declarado − soma das linhas do arquivo, quando o banco arredonda. */
	sourceRounding: number;
	transactions: InvoiceReconciliationTransaction[];
};

async function loadSourceFileRowsFromAttachment(
	attachmentId: string | null,
	sourceFileName: string | null,
) {
	if (!attachmentId || !sourceFileName) return [];

	try {
		const attachment = await db.query.attachments.findFirst({
			columns: { fileKey: true },
			where: eq(attachments.id, attachmentId),
		});

		if (!attachment?.fileKey) return [];

		const fileBuffer = await getS3ObjectBuffer(attachment.fileKey);
		const statement = await parseImportFileFromBuffer(
			sourceFileName,
			fileBuffer,
		);
		return sourceFileRowsFromStatement(statement);
	} catch (error) {
		console.error("fetchInvoiceReconciliation:sourceFile", error);
		return [];
	}
}

export async function fetchInvoiceReconciliation(
	userId: string,
	cardId: string,
	period: string,
): Promise<InvoiceReconciliationData> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	const [totalRow, lastBatch, periodTransactions] = await Promise.all([
		callRpcOne<InvoiceTotalRow>("get_invoice_total", {
			p_user_id: dataOwnerUserId,
			p_card_id: cardId,
			p_period: period,
		}),
		db.query.importBatches.findFirst({
			columns: {
				id: true,
				attachmentId: true,
				sourceFileName: true,
				sourceInvoiceTotal: true,
				sourceInvoiceTotalKind: true,
				sourceInvoiceTotalOverride: true,
				sourceFileRows: true,
			},
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.cardId, cardId),
				eq(importBatches.invoicePeriod, period),
			),
			orderBy: [desc(importBatches.createdAt)],
		}),
		db.query.transactions.findMany({
			columns: {
				id: true,
				name: true,
				amount: true,
				purchaseDate: true,
				importBatchId: true,
				ofxFitId: true,
				transactionType: true,
			},
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.cardId, cardId),
				eq(transactions.period, period),
			),
			orderBy: [desc(transactions.purchaseDate)],
		}),
	]);

	const registeredTotal = Math.abs(toNumber(totalRow?.total));
	const sourceTotal =
		lastBatch?.sourceInvoiceTotal != null
			? Math.abs(toNumber(lastBatch.sourceInvoiceTotal))
			: null;
	const sourceKind =
		(lastBatch?.sourceInvoiceTotalKind as InvoiceSourceTotalKind | null) ??
		null;

	let fileRows = parseStoredSourceFileRows(lastBatch?.sourceFileRows);
	if (fileRows.length === 0 && lastBatch) {
		fileRows = await loadSourceFileRowsFromAttachment(
			lastBatch.attachmentId,
			lastBatch.sourceFileName,
		);
	}

	const extraIds = new Set(
		fileRows.length > 0
			? findRegisteredRowsMissingFromFile(
					periodTransactions.map((transaction) => ({
						id: transaction.id,
						ofxFitId: transaction.ofxFitId,
						name: transaction.name,
						amount: transaction.amount,
						transactionType: transaction.transactionType,
						purchaseDate: transaction.purchaseDate,
					})),
					fileRows,
				).map((row) => row.id)
			: [],
	);

	const mappedTransactions: InvoiceReconciliationTransaction[] =
		periodTransactions.map((transaction) => {
			let group: InvoiceReconciliationTransaction["group"] = "last_import";

			if (transaction.name === INVOICE_ADJUSTMENT_NAME) {
				group = "adjustment";
			} else if (extraIds.has(transaction.id)) {
				group = "extra";
			}

			return {
				id: transaction.id,
				name: transaction.name,
				amount: toNumber(transaction.amount),
				purchaseDate: transaction.purchaseDate,
				importBatchId: transaction.importBatchId,
				group,
			};
		});

	// O cadastro é montado a partir das linhas do arquivo, então é contra a soma
	// delas que ele fecha. O total declarado pelo banco pode arredondar centavos.
	const fileRowsTotal =
		fileRows.length > 0
			? roundMoney(
					fileRows.reduce((total, row) => total + Math.abs(row.amount), 0),
				)
			: null;
	const closingTarget =
		sourceTotal != null
			? resolveInvoiceClosingTarget({ sourceTotal, fileRowsTotal })
			: null;

	const delta = closingTarget
		? roundMoney(registeredTotal - closingTarget.target)
		: null;

	return {
		registeredTotal,
		sourceTotal,
		sourceKind,
		sourceOverride: lastBatch?.sourceInvoiceTotalOverride ?? false,
		lastImportBatchId: lastBatch?.id ?? null,
		delta,
		sourceRounding: closingTarget?.rounding ?? 0,
		transactions: mappedTransactions,
	};
}
