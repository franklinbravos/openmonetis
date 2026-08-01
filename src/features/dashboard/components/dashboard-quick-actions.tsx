"use client";

import { RiAddFill, RiExchangeLine } from "@remixicon/react";
import { useState } from "react";
import { TransferDialog } from "@/features/accounts/components/transfer-dialog";
import type { AccountData } from "@/features/accounts/queries";
import type { DashboardAccount } from "@/features/dashboard/lib/accounts-queries";
import type { DashboardWidgetQuickActionOptions } from "@/features/dashboard/widget-registry/widget-config";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { isAccountInactive } from "@/shared/lib/accounts/constants";

type DashboardQuickActionsProps = {
	period: string;
	accounts: DashboardAccount[];
	quickActionOptions: DashboardWidgetQuickActionOptions;
};

const quickActionButtonClassName =
	"h-12 w-full min-w-0 flex-col justify-center gap-0.5 px-1.5 text-sm whitespace-normal sm:h-9 sm:w-auto sm:flex-row sm:gap-2 sm:px-3 sm:whitespace-nowrap";

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
	const [isMobileIncomeOpen, setIsMobileIncomeOpen] = useState(false);
	const [isMobileExpenseOpen, setIsMobileExpenseOpen] = useState(false);
	const [isMobileTransferOpen, setIsMobileTransferOpen] = useState(false);
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
		<div className="flex flex-wrap items-center gap-2">
			<div className="w-full sm:hidden">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="outline" className="w-full gap-2">
							<RiAddFill className="size-4 text-primary" />
							Novo lançamento
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-52">
						<DropdownMenuItem onSelect={() => setIsMobileIncomeOpen(true)}>
							<RiAddFill className="text-success/80" />
							Nova receita
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setIsMobileExpenseOpen(true)}>
							<RiAddFill className="text-destructive/80" />
							Nova despesa
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setIsMobileTransferOpen(true)}>
							<RiExchangeLine className="text-info/80" />
							Nova transferência
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="hidden w-full items-center gap-2 sm:flex sm:w-auto">
				<TransactionDialog
					{...transactionDialogProps}
					defaultTransactionType="Receita"
					trigger={
						<Button
							size="sm"
							variant="outline"
							className={quickActionButtonClassName}
						>
							<RiAddFill className="size-3.5 shrink-0 text-success/80" />
							Nova receita
						</Button>
					}
				/>
				<TransactionDialog
					{...transactionDialogProps}
					defaultTransactionType="Despesa"
					trigger={
						<Button
							size="sm"
							variant="outline"
							className={quickActionButtonClassName}
						>
							<RiAddFill className="size-3.5 shrink-0 text-destructive/80" />
							Nova despesa
						</Button>
					}
				/>
				<TransferDialog
					accounts={transferAccounts}
					currentPeriod={period}
					trigger={
						<Button
							size="sm"
							variant="outline"
							className={quickActionButtonClassName}
						>
							<RiExchangeLine className="size-3.5 shrink-0 text-info/80" />
							Nova transferência
						</Button>
					}
				/>
			</div>

			<TransactionDialog
				{...transactionDialogProps}
				open={isMobileIncomeOpen}
				onOpenChange={setIsMobileIncomeOpen}
				defaultTransactionType="Receita"
			/>
			<TransactionDialog
				{...transactionDialogProps}
				open={isMobileExpenseOpen}
				onOpenChange={setIsMobileExpenseOpen}
				defaultTransactionType="Despesa"
			/>
			<TransferDialog
				accounts={transferAccounts}
				currentPeriod={period}
				open={isMobileTransferOpen}
				onOpenChange={setIsMobileTransferOpen}
			/>
		</div>
	);
}
