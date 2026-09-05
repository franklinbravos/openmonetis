"use client";

import { TransferDialog } from "@/features/accounts/components/transfer-dialog";
import type { AccountData } from "@/features/accounts/queries";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import type { SelectOption } from "@/features/transactions/components/types";
import { TransactionQuickActionTrigger } from "./transaction-quick-action-trigger";

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
	attachmentMaxSizeMb,
	transferAccounts = [],
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
		maxSizeMb: attachmentMaxSizeMb,
	};

	return (
		<>
			<TransactionDialog
				{...sharedDialogProps}
				defaultTransactionType="Receita"
				trigger={<TransactionQuickActionTrigger kind="income" />}
			/>
			<TransactionDialog
				{...sharedDialogProps}
				defaultTransactionType="Despesa"
				trigger={<TransactionQuickActionTrigger kind="expense" />}
			/>
			{transferAccounts.length > 0 ? (
				<TransferDialog
					accounts={transferAccounts}
					currentPeriod={selectedPeriod}
					fromAccountId={defaultAccountId ?? undefined}
					trigger={<TransactionQuickActionTrigger kind="transfer" />}
				/>
			) : null}
		</>
	);
}
