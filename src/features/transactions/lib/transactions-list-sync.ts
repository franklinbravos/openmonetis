import type { TransactionItem } from "@/features/transactions/components/types";
import type { TransactionsPaginationState } from "@/features/transactions/lib/export-types";

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
	selectedPeriod,
	page,
	pageSize,
}: {
	current: TransactionItem[];
	incoming: TransactionItem[];
	selectedPeriod: string;
	page: number;
	pageSize: number;
}) {
	const byId = new Map(current.map((item) => [item.id, item]));
	let addedCount = 0;
	let removedCount = 0;

	for (const item of incoming) {
		if (item.period !== selectedPeriod) {
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
