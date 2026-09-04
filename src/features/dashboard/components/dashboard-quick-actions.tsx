"use client";

import { TransferDialog } from "@/features/accounts/components/transfer-dialog";
import type { AccountData } from "@/features/accounts/queries";
import type { DashboardAccount } from "@/features/dashboard/lib/accounts-queries";
import type { DashboardWidgetQuickActionOptions } from "@/features/dashboard/widget-registry/widget-config";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import { TransactionQuickActionTrigger } from "@/features/transactions/components/quick-actions/transaction-quick-action-trigger";
import { isAccountInactive } from "@/shared/lib/accounts/constants";

type DashboardQuickActionsProps = {
	period: string;
	accounts: DashboardAccount[];
	quickActionOptions: DashboardWidgetQuickActionOptions;
};

function mapDashboardAccounts(accounts: DashboardAccount[]): AccountData[] {
	return accounts
		.filter((account) => !isAccountInactive(account.status))
		.map((account) => ({
			id: account.id,
			name: account.name,
			accountType: account.accountType,
			status: account.status,
			note: null,
			logo: account.logo,
			initialBalance: account.initialBalance,
			balance: account.balance,
			excludeFromBalance: account.excludeFromBalance,
			excludeInitialBalanceFromIncome: false,
		}));
}

export function DashboardQuickActions({
	period,
	accounts,
	quickActionOptions,
}: DashboardQuickActionsProps) {
	const transferAccounts = mapDashboardAccounts(accounts);

	const transactionDialogProps = {
		mode: "create" as const,
		payerOptions: quickActionOptions.payerOptions,
		splitPayerOptions: quickActionOptions.splitPayerOptions,
		defaultPayerId: quickActionOptions.defaultPayerId,
		accountOptions: quickActionOptions.accountOptions,
		cardOptions: quickActionOptions.cardOptions,
		categoryOptions: quickActionOptions.categoryOptions,
		estabelecimentos: quickActionOptions.estabelecimentos,
		defaultPeriod: period,
	};

	return (
		<div className="flex min-w-0 max-w-full gap-2 max-sm:w-full sm:flex-wrap sm:items-center">
			<TransactionDialog
				{...transactionDialogProps}
				defaultTransactionType="Receita"
				trigger={<TransactionQuickActionTrigger kind="income" />}
			/>
			<TransactionDialog
				{...transactionDialogProps}
				defaultTransactionType="Despesa"
				trigger={<TransactionQuickActionTrigger kind="expense" />}
			/>
			<TransferDialog
				accounts={transferAccounts}
				currentPeriod={period}
				trigger={<TransactionQuickActionTrigger kind="transfer" />}
			/>
		</div>
	);
}
