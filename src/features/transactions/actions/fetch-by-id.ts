"use server";

import { fetchTransactionsByIdsForViewer } from "@/features/transactions/lib/fetch-transactions-by-ids";
import { getUser } from "@/shared/lib/auth/server";
import type { TransactionItem } from "../components/types";

export async function fetchTransactionByIdAction(
	transactionId: string,
): Promise<TransactionItem | null> {
	const items = await fetchTransactionsByIdsAction([transactionId]);
	return items[0] ?? null;
}

export async function fetchTransactionsByIdsAction(
	transactionIds: string[],
): Promise<TransactionItem[]> {
	const user = await getUser();
	return fetchTransactionsByIdsForViewer(user.id, transactionIds);
}
