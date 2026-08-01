"use client";

import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import {
	getEqualSplitAmounts,
	getSelectedPayerIds,
} from "@/features/transactions/lib/form-helpers";
import { formatCurrency } from "@/shared/utils/currency";
import { safeToNumber } from "@/shared/utils/number";
import { cn } from "@/shared/utils/ui";
import { PayerSelectContent } from "../../select-items";
import type { FormState } from "./transaction-dialog-types";

const splitRowClassName =
	"grid min-h-[2rem] items-center gap-2 rounded-lg border border-border bg-background p-1.5 sm:grid-cols-[minmax(0,1fr)_8rem]";

type SplitConfigDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	formState: FormState;
	onFieldChange: <Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) => void;
	payerOptions: Array<{
		value: string;
		label: string;
		role?: string | null;
		avatarUrl?: string | null;
	}>;
	splitPayerOptions: Array<{
		value: string;
		label: string;
		avatarUrl?: string | null;
	}>;
	totalAmount: number;
};

type SplitSummaryPayerOption = {
	value: string;
	label: string;
	avatarUrl?: string | null;
};

export function getSplitSummaryData(
	formState: FormState,
	payerOptions: SplitSummaryPayerOption[],
	totalAmount: number,
) {
	if (!formState.isSplit) {
		return {
			type: "text" as const,
			label: "Atribuir partes do valor a outras pessoas.",
		};
	}

	const participants = getSelectedPayerIds(formState);

	if (participants.length <= 1) {
		return {
			type: "text" as const,
			label: "Adicione mais pessoas para dividir o valor.",
		};
	}

	const total =
		safeToNumber(formState.primarySplitAmount) +
		formState.splitShares.reduce(
			(sum, share) => sum + safeToNumber(share.amount),
			0,
		);
	const displayedParticipants = participants
		.slice(0, 3)
		.map((payerId) => payerOptions.find((option) => option.value === payerId))
		.filter(Boolean)
		.map((option) => ({
			label: option?.label ?? "",
			firstName: option?.label.split(/\s+/)[0] ?? "",
			avatarUrl: option?.avatarUrl ?? null,
		}));
	const remainingCount = Math.max(0, participants.length - 3);
	const totalLabel =
		Math.abs(total - totalAmount) <= 0.01
			? formatCurrency(totalAmount)
			: `${formatCurrency(total)} de ${formatCurrency(totalAmount)}`;

	return {
		type: "split" as const,
		count: participants.length,
		participants: displayedParticipants,
		remainingCount,
		totalLabel,
	};
}

export function SplitConfigDialog({
	open,
	onOpenChange,
	formState,
	onFieldChange,
	payerOptions,
	totalAmount,
}: SplitConfigDialogProps) {
	const selectedPayerIds = getSelectedPayerIds(formState);
	const participants = selectedPayerIds
		.map((payerId) => payerOptions.find((option) => option.value === payerId))
		.filter(Boolean) as NonNullable<
		ReturnType<typeof payerOptions.find>
	>[];

	const splitTotal =
		safeToNumber(formState.primarySplitAmount) +
		formState.splitShares.reduce(
			(total, share) => total + safeToNumber(share.amount),
			0,
		);
	const splitDifference = totalAmount - splitTotal;
	const hasSplitDifference = Math.abs(splitDifference) > 0.01;
	const splitDifferenceLabel =
		splitDifference > 0
			? `Faltam ${formatCurrency(splitDifference)}`
			: `Sobram ${formatCurrency(Math.abs(splitDifference))}`;

	const applyEqualSplit = () => {
		const amounts = getEqualSplitAmounts(selectedPayerIds.length, totalAmount);
		if (amounts.length === 0) return;

		onFieldChange("primarySplitAmount", amounts[0] ?? "0.00");
		onFieldChange(
			"splitShares",
			selectedPayerIds.slice(1).map((payerId, index) => ({
				payerId,
				amount: amounts[index + 1] ?? "0.00",
			})),
		);
	};

	const handleAmountChange = (payerId: string, value: string) => {
		if (payerId === formState.payerId) {
			onFieldChange("primarySplitAmount", value);
			return;
		}

		onFieldChange(
			"splitShares",
			formState.splitShares.map((share) =>
				share.payerId === payerId ? { ...share, amount: value } : share,
			),
		);
	};

	const getShareAmount = (payerId: string) => {
		if (payerId === formState.payerId) {
			return formState.primarySplitAmount;
		}

		return (
			formState.splitShares.find((share) => share.payerId === payerId)?.amount ??
			""
		);
	};

	const handleDisableSplit = () => {
		onFieldChange("isSplit", false);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] min-w-0 flex-col overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Dividir lançamento</DialogTitle>
					<DialogDescription>
						Ajuste os valores por pessoa. Se não definir, o sistema divide
						igualmente ao salvar.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 space-y-2 overflow-y-auto pr-1">
					<div
						className={cn(
							"flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
							hasSplitDifference
								? "border-destructive/30 bg-destructive/5"
								: "border-primary/20 bg-primary/5",
						)}
					>
						<div>
							<p className="text-sm font-medium">
								{formatCurrency(splitTotal)} de {formatCurrency(totalAmount)}
							</p>
							<p
								className={cn(
									"text-xs",
									hasSplitDifference
										? "text-muted-foreground"
										: "text-muted-foreground",
								)}
							>
								{hasSplitDifference
									? `${splitDifferenceLabel} — será ajustado automaticamente ao salvar`
									: "Tudo certo"}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={applyEqualSplit}
							disabled={totalAmount <= 0 || selectedPayerIds.length < 2}
							className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
						>
							Dividir igualmente
						</Button>
					</div>

					<div className="space-y-2">
						{participants.map((option) => (
							<div key={option.value} className={splitRowClassName}>
								<div className="flex min-w-0 items-center gap-2 text-sm">
									<PayerSelectContent
										label={option.label}
										avatarUrl={option.avatarUrl}
									/>
								</div>
								<CurrencyInput
									value={getShareAmount(option.value)}
									onValueChange={(value) =>
										handleAmountChange(option.value, value)
									}
									placeholder="R$ 0,00"
									aria-label={`Valor de ${option.label}`}
									className="h-9 text-sm"
								/>
							</div>
						))}
					</div>
				</div>

				<DialogFooter className="shrink-0">
					<Button type="button" variant="outline" onClick={handleDisableSplit}>
						Cancelar divisão
					</Button>
					<Button type="button" onClick={() => onOpenChange(false)}>
						Concluir
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
