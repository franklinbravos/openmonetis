"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TransactionItem } from "@/features/transactions/components/types";
import type { TransactionsPaginationState } from "@/features/transactions/lib/export-types";
import { fetchTransactionsByIdsClient } from "@/features/transactions/lib/transactions-api-client";
import {
	adjustPaginationTotals,
	mergeTransactionItems,
	patchTransactionItem,
	removeTransactionItems,
	type TransactionsListMatchContext,
} from "@/features/transactions/lib/transactions-list-sync";
import { createClient } from "@/shared/lib/supabase/client";

type UseTransactionsRealtimeListOptions = {
	serverTransactions: TransactionItem[];
	serverPagination?: TransactionsPaginationState;
	listKey: string;
	listMatchContext: TransactionsListMatchContext;
	financialDataOwnerId: string;
	viewerUserId: string;
};

export function useTransactionsRealtimeList({
	serverTransactions,
	serverPagination,
	listKey,
	listMatchContext,
	financialDataOwnerId,
	viewerUserId,
}: UseTransactionsRealtimeListOptions) {
	const [transactions, setTransactions] = useState(serverTransactions);
	const [pagination, setPagination] = useState(serverPagination);
	const listKeyRef = useRef(listKey);
	const pendingFetchIdsRef = useRef(new Set<string>());

	useEffect(() => {
		if (listKeyRef.current === listKey) {
			return;
		}

		listKeyRef.current = listKey;
		setTransactions(serverTransactions);
		setPagination(serverPagination);
	}, [listKey, serverPagination, serverTransactions]);

	const refreshByIds = useCallback(
		async (ids: string[]) => {
			const uniqueIds = [...new Set(ids.filter(Boolean))];
			if (uniqueIds.length === 0) {
				return;
			}

			const pending = pendingFetchIdsRef.current;
			const idsToFetch = uniqueIds.filter((id) => !pending.has(id));
			if (idsToFetch.length === 0) {
				return;
			}

			for (const id of idsToFetch) {
				pending.add(id);
			}

			try {
				const fetched = await fetchTransactionsByIdsClient(idsToFetch);
				if (fetched.length === 0) {
					return;
				}

				setTransactions((current) => {
					const { items, addedCount, removedCount } = mergeTransactionItems({
						current,
						incoming: fetched,
						listMatchContext,
						page: pagination?.page ?? 1,
						pageSize: pagination?.pageSize ?? 30,
					});

					const delta = addedCount - removedCount;
					if (delta !== 0) {
						setPagination((currentPagination) =>
							adjustPaginationTotals(currentPagination, delta),
						);
					}

					return items;
				});
			} catch (error) {
				console.error("[transactions-realtime] refreshByIds", error);
			} finally {
				for (const id of idsToFetch) {
					pending.delete(id);
				}
			}
		},
		[listMatchContext, pagination?.page, pagination?.pageSize],
	);

	const removeByIds = useCallback((ids: string[]) => {
		setTransactions((current) => {
			const { items, removedCount } = removeTransactionItems(current, ids);
			if (removedCount > 0) {
				setPagination((currentPagination) =>
					adjustPaginationTotals(currentPagination, -removedCount),
				);
			}
			return items;
		});
	}, []);

	const patchItem = useCallback(
		(id: string, patch: Partial<TransactionItem>) => {
			setTransactions((current) => patchTransactionItem(current, id, patch));
		},
		[],
	);

	useEffect(() => {
		if (viewerUserId !== financialDataOwnerId) {
			return;
		}

		const supabase = createClient();
		const channel = supabase
			.channel(`lancamentos:${financialDataOwnerId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "lancamentos",
					filter: `user_id=eq.${financialDataOwnerId}`,
				},
				(payload) => {
					if (payload.eventType === "DELETE") {
						const deletedId = (payload.old as { id?: string }).id;
						if (deletedId) {
							removeByIds([deletedId]);
						}
						return;
					}

					const nextId = (payload.new as { id?: string }).id;
					if (nextId) {
						void refreshByIds([nextId]);
					}
				},
			)
			.subscribe();

		return () => {
			void supabase.removeChannel(channel);
		};
	}, [financialDataOwnerId, refreshByIds, removeByIds, viewerUserId]);

	return {
		transactions,
		pagination,
		refreshByIds,
		removeByIds,
		patchItem,
	};
}
