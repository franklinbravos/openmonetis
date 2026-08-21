"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

export type PreviousInvoiceFixTarget = {
	/** Mês da fatura sendo corrigida, para o usuário confirmar o lugar. */
	periodLabel: string;
	cardName: string;
	registeredTotal: number;
	/** Data hoje gravada no débito da fatura. */
	registeredPaymentDate: string | null;
	/** Data que o arquivo declara — a sugestão. */
	suggestedPaymentDate: string;
};

type PreviousInvoiceFixDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	target: PreviousInvoiceFixTarget;
	isPending: boolean;
	onConfirm: (paymentDate: string) => void;
};

/**
 * Correção da data de pagamento da fatura anterior.
 *
 * A sugestão vem preenchida — a data está no arquivo, não há o que digitar. O
 * diálogo existe para mostrar em qual fatura a alteração vai cair: é mês
 * fechado, e trocar a data no lugar errado é pior do que deixar como está.
 */
export function PreviousInvoiceFixDialog({
	open,
	onOpenChange,
	target,
	isPending,
	onConfirm,
}: PreviousInvoiceFixDialogProps) {
	const [paymentDate, setPaymentDate] = useState(target.suggestedPaymentDate);

	// Reabrir com outra fatura precisa recarregar a sugestão.
	useEffect(() => {
		if (open) setPaymentDate(target.suggestedPaymentDate);
	}, [open, target.suggestedPaymentDate]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Corrigir a data do pagamento</DialogTitle>
					<DialogDescription>
						A data vem do arquivo desta importação. Confira em qual fatura a
						alteração será aplicada.
					</DialogDescription>
				</DialogHeader>

				<dl className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
					<div className="flex items-center justify-between gap-3">
						<dt className="text-muted-foreground">Fatura</dt>
						<dd className="font-medium">
							{target.cardName} · {target.periodLabel}
						</dd>
					</div>
					<div className="flex items-center justify-between gap-3">
						<dt className="text-muted-foreground">Total da fatura</dt>
						<dd className="tabular-nums">
							{formatCurrency(target.registeredTotal)}
						</dd>
					</div>
					<div className="flex items-center justify-between gap-3">
						<dt className="text-muted-foreground">Data hoje</dt>
						<dd className="tabular-nums">
							{target.registeredPaymentDate
								? (formatDateOnly(target.registeredPaymentDate) ??
									target.registeredPaymentDate)
								: "sem data"}
						</dd>
					</div>
				</dl>

				<div className="space-y-1.5">
					<Label htmlFor="previous-invoice-payment-date">
						Nova data do pagamento
					</Label>
					<Input
						id="previous-invoice-payment-date"
						type="date"
						value={paymentDate}
						onChange={(event) => setPaymentDate(event.target.value)}
					/>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Sugerida pelo arquivo:{" "}
						{formatDateOnly(target.suggestedPaymentDate) ??
							target.suggestedPaymentDate}
						.
					</p>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => onConfirm(paymentDate)}
						disabled={isPending || !paymentDate}
					>
						{isPending ? "Corrigindo…" : "Corrigir data"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
