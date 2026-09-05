import { eq, inArray } from "drizzle-orm";
import { cards, transactions } from "@/db/schema";
import type { TransactionItem } from "@/features/transactions/components/types";
import { mapTransactionsData } from "@/features/transactions/lib/page-helpers";
import { fetchTransactionsWithRelations } from "@/features/transactions/queries";
import { collectInvoicePaymentCardIds } from "@/shared/lib/invoices/invoice-payment-transaction";
import { assertFinancialReadAccess } from "@/shared/lib/payers/financial-access";
import { db } from "@/shared/lib/db";

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

	const invoiceCardIds = collectInvoicePaymentCardIds(rows);
	const cardRows =
		invoiceCardIds.length > 0
			? await db.query.cards.findMany({
					where: inArray(cards.id, invoiceCardIds),
				})
			: [];

	return mapTransactionsData(rows, undefined, cardRows);
}
