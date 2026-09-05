import { eq, inArray } from "drizzle-orm";
import { transactions } from "@/db/schema";
import type { TransactionItem } from "@/features/transactions/components/types";
import { mapTransactionsData } from "@/features/transactions/lib/page-helpers";
import { fetchTransactionsWithRelations } from "@/features/transactions/queries";
import { assertFinancialReadAccess } from "@/shared/lib/payers/financial-access";

export async function fetchTransactionsByIdsForViewer(
	viewerUserId: string,
	transactionIds: string[],
): Promise<TransactionItem[]> {
	const uniqueIds = [...new Set(transactionIds.filter(Boolean))];
	if (uniqueIds.length === 0) {
		return [];
	}

	const { dataOwnerUserId } = await assertFinancialReadAccess(viewerUserId);
	const rows = await fetchTransactionsWithRelations({
		filters: [
			inArray(transactions.id, uniqueIds),
			eq(transactions.userId, dataOwnerUserId),
		],
		excludeInitialBalanceFromIncome: false,
	});

	return mapTransactionsData(rows);
}
