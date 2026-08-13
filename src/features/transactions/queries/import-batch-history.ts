import { and, desc, eq, isNull } from "drizzle-orm";
import { cards, financialAccounts, importBatches } from "@/db/schema";
import { parseImportBatchStatus } from "@/features/transactions/lib/import-batch-status";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";

type FetchImportBatchHistoryInput = {
	userId: string;
	cardId?: string | null;
	invoicePeriod?: string | null;
	accountId?: string | null;
	limit?: number;
};

function parseImportBatchStatusFromDb(value: string) {
	return parseImportBatchStatus(value);
}

export async function fetchImportBatchHistory({
	userId,
	cardId = null,
	invoicePeriod = null,
	accountId = null,
	limit = 20,
}: FetchImportBatchHistoryInput): Promise<ImportFileHistoryEntry[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const filters = [eq(importBatches.userId, dataOwnerUserId)];

	if (cardId) {
		filters.push(eq(importBatches.cardId, cardId));
	}

	if (invoicePeriod) {
		filters.push(eq(importBatches.invoicePeriod, invoicePeriod));
	}

	if (accountId) {
		filters.push(eq(importBatches.accountId, accountId));
		filters.push(isNull(importBatches.cardId));
	}

	const rows = await db
		.select({
			id: importBatches.id,
			sourceFileName: importBatches.sourceFileName,
			sourceFileSize: importBatches.sourceFileSize,
			importedCount: importBatches.importedCount,
			skippedCount: importBatches.skippedCount,
			status: importBatches.status,
			createdAt: importBatches.createdAt,
			attachmentId: importBatches.attachmentId,
			cardId: importBatches.cardId,
			invoicePeriod: importBatches.invoicePeriod,
			cardName: cards.name,
			accountId: importBatches.accountId,
			accountName: financialAccounts.name,
		})
		.from(importBatches)
		.leftJoin(cards, eq(importBatches.cardId, cards.id))
		.leftJoin(
			financialAccounts,
			eq(importBatches.accountId, financialAccounts.id),
		)
		.where(and(...filters))
		.orderBy(desc(importBatches.createdAt))
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		sourceFileName: row.sourceFileName,
		sourceFileSize: row.sourceFileSize,
		importedCount: row.importedCount,
		skippedCount: row.skippedCount,
		status: parseImportBatchStatusFromDb(row.status),
		createdAt: row.createdAt,
		hasAttachment: row.attachmentId != null,
		cardId: row.cardId,
		invoicePeriod: row.invoicePeriod,
		cardName: row.cardName,
		accountId: row.accountId,
		accountName: row.accountName,
	}));
}
