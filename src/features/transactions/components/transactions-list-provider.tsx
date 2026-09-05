"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { TransactionItem } from "@/features/transactions/components/types";
import { useTransactionsRealtimeList } from "@/features/transactions/hooks/use-transactions-realtime-list";
import type { TransactionsPaginationState } from "@/features/transactions/lib/export-types";

type TransactionsListContextValue = {
	transactions: TransactionItem[];
	pagination?: TransactionsPaginationState;
	refreshByIds: (ids: string[]) => Promise<void>;
	removeByIds: (ids: string[]) => void;
	patchItem: (id: string, patch: Partial<TransactionItem>) => void;
};

const TransactionsListContext =
	createContext<TransactionsListContextValue | null>(null);

type TransactionsListProviderProps = {
	children: ReactNode;
	serverTransactions: TransactionItem[];
	serverPagination?: TransactionsPaginationState;
	listKey: string;
	selectedPeriod: string;
	financialDataOwnerId: string;
	viewerUserId: string;
};

export function TransactionsListProvider({
	children,
	serverTransactions,
	serverPagination,
	listKey,
	selectedPeriod,
	financialDataOwnerId,
	viewerUserId,
}: TransactionsListProviderProps) {
	const value = useTransactionsRealtimeList({
		serverTransactions,
		serverPagination,
		listKey,
		selectedPeriod,
		financialDataOwnerId,
		viewerUserId,
	});

	const contextValue = useMemo(
		() => ({
			transactions: value.transactions,
			pagination: value.pagination,
			refreshByIds: value.refreshByIds,
			removeByIds: value.removeByIds,
			patchItem: value.patchItem,
		}),
		[
			value.pagination,
			value.patchItem,
			value.refreshByIds,
			value.removeByIds,
			value.transactions,
		],
	);

	return (
		<TransactionsListContext.Provider value={contextValue}>
			{children}
		</TransactionsListContext.Provider>
	);
}

export function useTransactionsListOptional() {
	return useContext(TransactionsListContext);
}

export function useTransactionsList() {
	const context = useContext(TransactionsListContext);
	if (!context) {
		throw new Error(
			"useTransactionsList deve ser usado dentro de TransactionsListProvider.",
		);
	}
	return context;
}
