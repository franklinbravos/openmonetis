"use client";

import {
	RiAlertLine,
	RiCheckboxCircleLine,
	RiCloseCircleLine,
} from "@remixicon/react";
import { Badge } from "@/shared/components/ui/badge";
import type { PreviousInvoiceReview } from "@/shared/lib/import/invoice-rollover";
import { formatCurrency } from "@/shared/utils/currency";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type PreviousInvoiceSettlementCardProps = {
	review: PreviousInvoiceReview;
	previousPeriod: string;
	/** Valor que rolou para esta fatura, quando houve rotativo. */
	carriedOver: number;
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
}: PreviousInvoiceSettlementCardProps) {
	const periodLabel = displayPeriod(previousPeriod);

	return (
		<div
			className={cn(
				"space-y-2 rounded-lg border px-3 py-3 sm:px-4",
				review.allOk
					? "border-emerald-500/30 bg-emerald-500/5"
					: "border-amber-500/30 bg-amber-500/5",
			)}
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				{review.allOk ? (
					<RiCheckboxCircleLine className="size-4 shrink-0 text-emerald-600" />
				) : (
					<RiAlertLine className="size-4 shrink-0 text-amber-600" />
				)}
				<p className="font-medium text-sm">Fatura de {periodLabel}</p>
				<Badge
					variant="outline"
					className={cn(
						"font-normal text-xs",
						review.allOk
							? "border-emerald-500/40 text-emerald-700 dark:text-emerald-500"
							: "border-amber-500/40 text-amber-700 dark:text-amber-500",
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
							<RiCheckboxCircleLine className="size-3.5 shrink-0 text-emerald-600" />
						) : (
							<RiCloseCircleLine className="size-3.5 shrink-0 text-amber-600" />
						)}
						<span className="text-muted-foreground">{check.label}</span>
						<span
							className={cn(
								"tabular-nums",
								check.ok
									? "font-medium"
									: "font-medium text-amber-700 dark:text-amber-500",
							)}
						>
							{check.value}
						</span>
						{check.detail ? (
							<span className="text-amber-700 dark:text-amber-500">
								({check.detail})
							</span>
						) : null}
					</li>
				))}
			</ul>
		</div>
	);
}
