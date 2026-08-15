"use client";

import {
	RiArrowLeftRightLine,
	RiArrowRightDownLine,
	RiArrowRightUpLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type { ComponentProps } from "react";
import { TransferDialog } from "@/features/accounts/components/transfer-dialog";
import type { AccountData } from "@/features/accounts/queries";
import type { DashboardAccount } from "@/features/dashboard/lib/accounts-queries";
import type { DashboardWidgetQuickActionOptions } from "@/features/dashboard/widget-registry/widget-config";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import { TRANSACTION_QUICK_ACTIONS } from "@/features/transactions/components/quick-actions/constants";
import { Button } from "@/shared/components/ui/button";
import { isAccountInactive } from "@/shared/lib/accounts/constants";
import { cn } from "@/shared/utils/ui";

type DashboardQuickActionsProps = {
	period: string;
	accounts: DashboardAccount[];
	quickActionOptions: DashboardWidgetQuickActionOptions;
};

type QuickActionKind = "income" | "expense" | "transfer";

type QuickActionUi = {
	Icon: RemixiconComponentType;
	label: string;
	shortLabel: string;
	surfaceClassName: string;
	iconRailClassName: string;
};

const QUICK_ACTION_UI: Record<QuickActionKind, QuickActionUi> = {
	income: {
		Icon: RiArrowRightDownLine,
		label: TRANSACTION_QUICK_ACTIONS.income.label,
		shortLabel: TRANSACTION_QUICK_ACTIONS.income.shortLabel,
		surfaceClassName:
			"border-success/30 bg-card text-foreground hover:border-success/45 hover:bg-success/6 active:bg-success/10 dark:border-success/25 dark:hover:bg-success/10",
		iconRailClassName:
			"bg-success/12 text-success group-hover:bg-success/18 dark:bg-success/16 dark:group-hover:bg-success/22",
	},
	expense: {
		Icon: RiArrowRightUpLine,
		label: TRANSACTION_QUICK_ACTIONS.expense.label,
		shortLabel: TRANSACTION_QUICK_ACTIONS.expense.shortLabel,
		surfaceClassName:
			"border-destructive/30 bg-card text-foreground hover:border-destructive/45 hover:bg-destructive/6 active:bg-destructive/10 dark:border-destructive/25 dark:hover:bg-destructive/10",
		iconRailClassName:
			"bg-destructive/10 text-destructive group-hover:bg-destructive/16 dark:bg-destructive/14 dark:group-hover:bg-destructive/20",
	},
	transfer: {
		Icon: RiArrowLeftRightLine,
		label: TRANSACTION_QUICK_ACTIONS.transfer.label,
		shortLabel: TRANSACTION_QUICK_ACTIONS.transfer.shortLabel,
		surfaceClassName:
			"border-primary/25 bg-card text-foreground hover:border-primary/40 hover:bg-primary/6 active:bg-primary/10 dark:border-primary/20 dark:hover:bg-primary/10",
		iconRailClassName:
			"bg-primary/10 text-primary group-hover:bg-primary/14 dark:bg-primary/14 dark:group-hover:bg-primary/20",
	},
};

const quickActionButtonClassName =
	"group flex h-11 min-h-11 min-w-0 flex-1 basis-0 items-stretch justify-start gap-0 overflow-hidden rounded-xl border p-0 text-sm font-medium shadow-xs transition-all duration-200 hover:shadow-sm active:scale-[0.99] sm:h-9 sm:min-h-9 sm:flex-none sm:basis-auto";

function QuickActionLabel({
	label,
	shortLabel,
}: {
	label: string;
	shortLabel: string;
}) {
	return (
		<>
			<span className="sm:hidden">{shortLabel}</span>
			<span className="hidden sm:inline xl:hidden">{shortLabel}</span>
			<span className="hidden xl:inline">{label}</span>
		</>
	);
}

function QuickActionTrigger({
	kind,
	...props
}: {
	kind: QuickActionKind;
} & Omit<ComponentProps<typeof Button>, "children" | "variant">) {
	const ui = QUICK_ACTION_UI[kind];
	const Icon = ui.Icon;

	return (
		<Button
			type="button"
			variant="ghost"
			className={cn(quickActionButtonClassName, ui.surfaceClassName)}
			{...props}
		>
			<span
				className={cn(
					"flex w-10 shrink-0 items-center justify-center border-r border-border/50 transition-colors",
					ui.iconRailClassName,
				)}
			>
				<Icon className="size-4" aria-hidden />
			</span>
			<span className="flex min-w-0 flex-1 items-center justify-center px-2 text-center text-xs font-semibold leading-none sm:px-3 sm:text-sm sm:font-medium">
				<QuickActionLabel label={ui.label} shortLabel={ui.shortLabel} />
			</span>
		</Button>
	);
}

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
				trigger={<QuickActionTrigger kind="income" />}
			/>
			<TransactionDialog
				{...transactionDialogProps}
				defaultTransactionType="Despesa"
				trigger={<QuickActionTrigger kind="expense" />}
			/>
			<TransferDialog
				accounts={transferAccounts}
				currentPeriod={period}
				trigger={<QuickActionTrigger kind="transfer" />}
			/>
		</div>
	);
}
