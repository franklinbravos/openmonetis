"use client";

import {
	RiAlertLine,
	RiCheckboxCircleLine,
	RiCloseCircleLine,
} from "@remixicon/react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import type {
	AllocatedInvoicePayment,
	PreviousInvoiceReview,
} from "@/shared/lib/import/invoice-rollover";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type PreviousInvoiceSettlementCardProps = {
	review: PreviousInvoiceReview;
	previousPeriod: string;
	/** Valor que rolou para esta fatura, quando houve rotativo. */
	carriedOver: number;
	/** Pagamentos do arquivo, já distribuídos entre a fatura anterior e esta. */
	payments?: AllocatedInvoicePayment[];
	/** Abre a correção da divergência apontada. Sem isso, o bloco é só leitura. */
	onFix?: () => void;
};

/**
 * Conferência da fatura anterior.
 *
 * Em quase todo mês está tudo certo, então o bloco é visual: uma tag por ponto
 * conferido. Só o que diverge ganha texto, porque só o que diverge exige leitura.
 */
export function PreviousInvoiceSettlementCard({
	review,
	previousPeriod,
	carriedOver,
	payments = [],
	onFix,
}: PreviousInvoiceSettlementCardProps) {
	const periodLabel = displayPeriod(previousPeriod);

	return (
		<div
			className={cn(
				"space-y-2 rounded-lg border px-3 py-3 sm:px-4",
				review.allOk
					? "border-positive/30 bg-positive-surface"
					: "border-warning/30 bg-warning/5",
			)}
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				{review.allOk ? (
					<RiCheckboxCircleLine className="size-4 shrink-0 text-positive" />
				) : (
					<RiAlertLine className="size-4 shrink-0 text-warning" />
				)}
				<p className="font-medium text-sm">Fatura de {periodLabel}</p>
				<Badge
					variant="outline"
					className={cn(
						"font-normal text-xs",
						review.allOk
							? "border-positive/40 text-positive"
							: "border-warning/40 text-warning",
					)}
				>
					{review.noFileEvidence
						? "Sem pendência"
						: review.allOk
							? "Confere"
							: "Requer atenção"}
				</Badge>
				{carriedOver > 0 ? (
					<Badge variant="outline" className="font-normal text-xs">
						Rolou {formatCurrency(carriedOver)}
					</Badge>
				) : null}

				{onFix && !review.allOk ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="ml-auto h-7 px-2.5 text-xs"
						onClick={onFix}
					>
						Ajustar
					</Button>
				) : null}
			</div>

			{review.noFileEvidence ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					Este arquivo não traz a linha de pagamento, então o valor e a data não
					podem ser conferidos — mas também não traz saldo pendente do mês
					anterior, o que indica que nada ficou rolando. Nada é alterado.
				</p>
			) : null}

			<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{review.checks.map((check) => (
					<li key={check.label} className="flex items-center gap-1.5">
						{check.ok ? (
							<RiCheckboxCircleLine className="size-3.5 shrink-0 text-positive" />
						) : (
							<RiCloseCircleLine className="size-3.5 shrink-0 text-warning" />
						)}
						<span className="text-muted-foreground">{check.label}</span>
						<span
							className={cn(
								"tabular-nums",
								check.ok
									? "font-medium"
									: "font-medium text-warning",
							)}
						>
							{check.value}
						</span>
						{check.detail ? (
							<span className="text-warning">
								({check.detail})
							</span>
						) : check.note ? (
							<span className="text-muted-foreground">({check.note})</span>
						) : null}
					</li>
				))}
			</ul>

			{/* Quem paga em vários dias para reduzir juros precisa ver cada
			    pagamento: um número só esconde o parcelamento do pagamento e não
			    deixa conferir contra o extrato da conta. */}
			{payments.length > 1 ? (
				<ul className="space-y-0.5 border-t pt-2 text-xs">
					{payments.map((payment) => (
						<li
							key={`${payment.date}-${payment.amount}`}
							className="flex flex-wrap items-baseline gap-x-2"
						>
							<span className="tabular-nums">
								{payment.date
									? (formatDateOnly(payment.date) ?? payment.date)
									: "sem data"}
							</span>
							<span className="font-medium tabular-nums">
								{formatCurrency(payment.amount)}
							</span>
							<span className="text-muted-foreground">
								{payment.appliedToCurrent <= 0.01
									? `abateu ${periodLabel}`
									: payment.appliedToPrevious <= 0.01
										? "amortizou esta fatura"
										: `${formatCurrency(payment.appliedToPrevious)} em ${periodLabel}, ${formatCurrency(payment.appliedToCurrent)} nesta`}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
