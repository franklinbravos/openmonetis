"use client";

import {
	RiAddCircleFill,
	RiExchangeLine,
	RiSubtractLine,
} from "@remixicon/react";
import { useState } from "react";
import { TransferDialog } from "@/features/accounts/components/transfer-dialog";
import type { AccountData } from "@/features/accounts/queries";
import type { DashboardAccount } from "@/features/dashboard/lib/accounts-queries";
import type { DashboardWidgetQuickActionOptions } from "@/features/dashboard/widget-registry/widget-config";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import {
	TRANSACTION_QUICK_ACTIONS,
	transactionQuickActionButtonClassName,
} from "@/features/transactions/components/quick-actions/constants";
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

const quickActionButtonClassName = transactionQuickActionButtonClassName;

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
							<RiAddCircleFill className="size-4 text-primary" />
							Novo lançamento
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-52">
						<DropdownMenuItem onSelect={() => setIsMobileIncomeOpen(true)}>
							<RiAddCircleFill className="text-success/80" />
							{TRANSACTION_QUICK_ACTIONS.income.label}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setIsMobileExpenseOpen(true)}>
							<RiSubtractLine className="text-destructive/80" />
							{TRANSACTION_QUICK_ACTIONS.expense.label}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setIsMobileTransferOpen(true)}>
							<RiExchangeLine className="text-info/80" />
							{TRANSACTION_QUICK_ACTIONS.transfer.label}
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
							variant={TRANSACTION_QUICK_ACTIONS.income.variant}
							className={quickActionButtonClassName}
						>
							<TRANSACTION_QUICK_ACTIONS.income.Icon
								className={TRANSACTION_QUICK_ACTIONS.income.iconClassName}
								aria-hidden
							/>
							<span className="hidden sm:inline">
								{TRANSACTION_QUICK_ACTIONS.income.label}
							</span>
							<span className="sr-only sm:hidden">
								{TRANSACTION_QUICK_ACTIONS.income.label}
							</span>
						</Button>
					}
				/>
				<TransactionDialog
					{...transactionDialogProps}
					defaultTransactionType="Despesa"
					trigger={
						<Button
							size="sm"
							variant={TRANSACTION_QUICK_ACTIONS.expense.variant}
							className={quickActionButtonClassName}
						>
							<TRANSACTION_QUICK_ACTIONS.expense.Icon
								className={TRANSACTION_QUICK_ACTIONS.expense.iconClassName}
								aria-hidden
							/>
							<span className="hidden sm:inline">
								{TRANSACTION_QUICK_ACTIONS.expense.label}
							</span>
							<span className="sr-only sm:hidden">
								{TRANSACTION_QUICK_ACTIONS.expense.label}
							</span>
						</Button>
					}
				/>
				<TransferDialog
					accounts={transferAccounts}
					currentPeriod={period}
					trigger={
						<Button
							size="sm"
							variant={TRANSACTION_QUICK_ACTIONS.transfer.variant}
							className={quickActionButtonClassName}
						>
							<TRANSACTION_QUICK_ACTIONS.transfer.Icon
								className={TRANSACTION_QUICK_ACTIONS.transfer.iconClassName}
								aria-hidden
							/>
							<span className="hidden sm:inline">
								{TRANSACTION_QUICK_ACTIONS.transfer.label}
							</span>
							<span className="sr-only sm:hidden">
								{TRANSACTION_QUICK_ACTIONS.transfer.label}
							</span>
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
