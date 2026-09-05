import type { TransactionItem } from "@/features/transactions/components/types";
import type { TransactionsPaginationState } from "@/features/transactions/lib/export-types";
import { getPeriodPurchaseDateBounds } from "@/shared/utils/period";

export type TransactionsListMatchContext = {
	selectedPeriod: string;
	listCardId?: string | null;
	listAccountId?: string | null;
	listPayerId?: string | null;
	/** Lista geral: filtra pela data de compra no mês. Contextos (fatura/extrato/pessoa): filtra pelo campo period. */
	matchByPurchaseDateMonth?: boolean;
};

export function resolveTransactionsListMatchContext(
	selectedPeriod: string,
	options?: {
		listCardId?: string | null;
		listAccountId?: string | null;
		listPayerId?: string | null;
		matchByPurchaseDateMonth?: boolean;
	},
): TransactionsListMatchContext {
	const hasScopedList = Boolean(
		options?.listCardId || options?.listAccountId || options?.listPayerId,
	);

	return {
		selectedPeriod,
		listCardId: options?.listCardId ?? null,
		listAccountId: options?.listAccountId ?? null,
		listPayerId: options?.listPayerId ?? null,
		matchByPurchaseDateMonth:
			options?.matchByPurchaseDateMonth ?? !hasScopedList,
	};
}

export function transactionMatchesListContext(
	item: TransactionItem,
	context: TransactionsListMatchContext,
): boolean {
	if (context.listCardId && item.cardId !== context.listCardId) {
		return false;
	}

	if (context.listAccountId && item.accountId !== context.listAccountId) {
		return false;
	}

	if (context.listPayerId && item.payerId !== context.listPayerId) {
		return false;
	}

	if (context.matchByPurchaseDateMonth) {
		const { start, end } = getPeriodPurchaseDateBounds(context.selectedPeriod);
		const purchaseDate = item.purchaseDate.slice(0, 10);
		return purchaseDate >= start && purchaseDate <= end;
	}

	return item.period === context.selectedPeriod;
}

export function sortTransactionItems(items: TransactionItem[]) {
	return [...items].sort((left, right) => {
		const dateCompare = right.purchaseDate.localeCompare(left.purchaseDate);
		if (dateCompare !== 0) {
			return dateCompare;
		}

		return right.id.localeCompare(left.id);
	});
}

export function mergeTransactionItems({
	current,
	incoming,
	listMatchContext,
	page,
	pageSize,
}: {
	current: TransactionItem[];
	incoming: TransactionItem[];
	listMatchContext: TransactionsListMatchContext;
	page: number;
	pageSize: number;
}) {
	const byId = new Map(current.map((item) => [item.id, item]));
	let addedCount = 0;
	let removedCount = 0;

	for (const item of incoming) {
		if (!transactionMatchesListContext(item, listMatchContext)) {
			if (byId.delete(item.id)) {
				removedCount += 1;
			}
			continue;
		}

		const existed = byId.has(item.id);
		byId.set(item.id, item);
		if (!existed) {
			addedCount += 1;
		}
	}

	let nextItems = sortTransactionItems([...byId.values()]);

	if (page > 1) {
		return {
			items: nextItems,
			addedCount,
			removedCount,
		};
	}

	const maxVisibleItems = pageSize + Math.max(addedCount, 0);
	if (nextItems.length > maxVisibleItems) {
		nextItems = nextItems.slice(0, maxVisibleItems);
	}

	return {
		items: nextItems,
		addedCount,
		removedCount,
	};
}

export function removeTransactionItems(
	current: TransactionItem[],
	ids: string[],
) {
	const idSet = new Set(ids);
	const nextItems = current.filter((item) => !idSet.has(item.id));
	return {
		items: nextItems,
		removedCount: current.length - nextItems.length,
	};
}

export function patchTransactionItem(
	current: TransactionItem[],
	id: string,
	patch: Partial<TransactionItem>,
) {
	return current.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function adjustPaginationTotals(
	pagination: TransactionsPaginationState | undefined,
	delta: number,
) {
	if (!pagination || delta === 0) {
		return pagination;
	}

	const totalItems = Math.max(0, pagination.totalItems + delta);
	const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));

	return {
		...pagination,
		totalItems,
		totalPages,
	};
}
