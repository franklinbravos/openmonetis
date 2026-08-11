"use client";

import { TransferDialog } from "@/features/accounts/components/transfer-dialog";
import type { AccountData } from "@/features/accounts/queries";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import type { SelectOption } from "@/features/transactions/components/types";
import { TransactionQuickActionButton } from "./transaction-quick-action-button";

type TransactionsQuickActionsProps = {
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	estabelecimentos: string[];
	selectedPeriod: string;
	defaultAccountId?: string | null;
	defaultCardId?: string | null;
	defaultPaymentMethod?: string | null;
	lockCardSelection?: boolean;
	lockPaymentMethod?: boolean;
	attachmentMaxSizeMb?: number;
	transferAccounts?: AccountData[];
};

export function TransactionsQuickActions({
	payerOptions,
	splitPayerOptions,
	defaultPayerId,
	accountOptions,
	cardOptions,
	categoryOptions,
	estabelecimentos,
	selectedPeriod,
	defaultAccountId,
	defaultCardId,
	defaultPaymentMethod,
	lockCardSelection,
	lockPaymentMethod,
	attachmentMaxSizeMb,
	transferAccounts,
}: TransactionsQuickActionsProps) {
	const sharedDialogProps = {
		mode: "create" as const,
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
		estabelecimentos,
		defaultPeriod: selectedPeriod,
		defaultAccountId,
		defaultCardId,
		defaultPaymentMethod,
		lockCardSelection,
		lockPaymentMethod,
		maxSizeMb: attachmentMaxSizeMb,
	};

	return (
		<div className="quick-actions-root max-md:contents md:flex md:h-full md:min-w-0 md:flex-none md:items-stretch md:gap-0 md:divide-x md:divide-border md:self-stretch">
			<TransactionDialog
				{...sharedDialogProps}
				defaultTransactionType="Receita"
				trigger={<TransactionQuickActionButton kind="income" />}
			/>
			<TransactionDialog
				{...sharedDialogProps}
				defaultTransactionType="Despesa"
				trigger={<TransactionQuickActionButton kind="expense" />}
			/>
			{transferAccounts && transferAccounts.length > 0 ? (
				<TransferDialog
					accounts={transferAccounts}
					currentPeriod={selectedPeriod}
					fromAccountId={defaultAccountId ?? undefined}
					trigger={<TransactionQuickActionButton kind="transfer" />}
				/>
			) : null}
		</div>
	);
}
