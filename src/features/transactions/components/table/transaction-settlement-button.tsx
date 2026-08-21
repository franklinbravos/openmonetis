"use client";

import {
	RiBankCard2Line,
	RiCheckboxBlankCircleLine,
	RiCheckboxCircleFill,
	RiCheckboxCircleLine,
} from "@remixicon/react";
import { useIsPartiallyPaidInvoice } from "@/features/transactions/components/table/partially-paid-invoices-context";
import {
	CREDIT_CARD_PAYMENT_METHOD,
	SETTLEABLE_PAYMENT_METHODS,
} from "@/features/transactions/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/utils/ui";
import type { TransactionItem } from "../types";

type TransactionSettlementButtonProps = {
	item: TransactionItem;
	isLoading: boolean;
	onToggle?: (item: TransactionItem) => void;
};

export function TransactionSettlementButton({
	item,
	isLoading,
	onToggle,
}: TransactionSettlementButtonProps) {
	const isPartialInvoice = useIsPartiallyPaidInvoice(item.cardId, item.period);
	const isCreditCard = item.paymentMethod === CREDIT_CARD_PAYMENT_METHOD;
	const canToggleSettlement = (
		SETTLEABLE_PAYMENT_METHODS as readonly string[]
	).includes(item.paymentMethod);

	if (!canToggleSettlement && !isCreditCard) {
		return null;
	}

	if (isCreditCard) {
		const invoicePaid = Boolean(item.isSettled);
		// Fatura rolada: o lançamento está liquidado, mas dizer "Fatura paga"
		// contradiz o cabeçalho da própria fatura.
		const partiallyPaid = invoicePaid && isPartialInvoice;
		const label = partiallyPaid
			? "Fatura paga parcialmente"
			: invoicePaid
				? "Fatura paga"
				: "Lançamento de cartão de crédito";

		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<Button
							variant="ghost"
							size="icon-sm"
							disabled
							className={cn(
								"transition-colors",
								partiallyPaid
									? "bg-amber-500/10 text-amber-600 dark:text-amber-500"
									: invoicePaid
										? "bg-success/10 text-success"
										: "text-muted-foreground/30",
							)}
						>
							{partiallyPaid ? (
								<RiCheckboxCircleLine className="size-4" aria-hidden />
							) : invoicePaid ? (
								<RiCheckboxCircleFill className="size-4" aria-hidden />
							) : (
								<RiBankCard2Line className="size-4" aria-hidden />
							)}
							<span className="sr-only">{label}</span>
						</Button>
					</span>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-48 text-center">
					{partiallyPaid
						? "Fatura paga parcialmente; o saldo restante foi cobrado na fatura seguinte"
						: invoicePaid
							? "Fatura paga"
							: "Lançamentos de cartão de crédito são liquidados ao pagar a fatura"}
				</TooltipContent>
			</Tooltip>
		);
	}

	const settled = Boolean(item.isSettled);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => onToggle?.(item)}
					disabled={isLoading || item.readonly}
					className={cn(
						"transition-colors",
						settled
							? "bg-success/10 text-success hover:bg-success/20 hover:text-success"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{isLoading ? (
						<Spinner className="size-4" />
					) : settled ? (
						<RiCheckboxCircleFill className="size-4" aria-hidden />
					) : (
						<RiCheckboxBlankCircleLine className="size-4" aria-hidden />
					)}
					<span className="sr-only">
						{settled ? "Desfazer pagamento" : "Marcar como pago"}
					</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">
				{settled ? "Desfazer pagamento" : "Marcar como pago"}
			</TooltipContent>
		</Tooltip>
	);
}
