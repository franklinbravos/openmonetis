"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { TransactionItem } from "@/features/transactions/components/types";
import { useTransactionsRealtimeList } from "@/features/transactions/hooks/use-transactions-realtime-list";
import type { TransactionsPaginationState } from "@/features/transactions/lib/export-types";
import { resolveTransactionsListMatchContext } from "@/features/transactions/lib/transactions-list-sync";

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
	listCardId?: string | null;
	listAccountId?: string | null;
	listPayerId?: string | null;
	matchByPurchaseDateMonth?: boolean;
	financialDataOwnerId: string;
	viewerUserId: string;
};

export function TransactionsListProvider({
	children,
	serverTransactions,
	serverPagination,
	listKey,
	selectedPeriod,
	listCardId,
	listAccountId,
	listPayerId,
	matchByPurchaseDateMonth,
	financialDataOwnerId,
	viewerUserId,
}: TransactionsListProviderProps) {
	const listMatchContext = useMemo(
		() =>
			resolveTransactionsListMatchContext(selectedPeriod, {
				listCardId,
				listAccountId,
				listPayerId,
				matchByPurchaseDateMonth,
			}),
		[
			listAccountId,
			listCardId,
			listPayerId,
			matchByPurchaseDateMonth,
			selectedPeriod,
		],
	);

	const value = useTransactionsRealtimeList({
		serverTransactions,
		serverPagination,
		listKey,
		listMatchContext,
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
