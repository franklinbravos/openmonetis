"use client";

import { RiInformationLine } from "@remixicon/react";
import type { PreviousInvoiceSettlement } from "@/shared/lib/import/invoice-rollover";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { formatCurrency } from "@/shared/utils/currency";
import { displayPeriod } from "@/shared/utils/period";

type PreviousInvoiceSettlementCardProps = {
	settlement: PreviousInvoiceSettlement;
	previousPeriod: string;
	/** Débito hoje registrado como pagamento da fatura anterior. */
	registeredPaymentAmount: number | null;
	rolloverCharges: number;
};

/**
 * Como a fatura anterior foi paga, apurado pelo arquivo desta.
 *
 * O bloco existe para o usuário conferir antes de confirmar: a importação vai
 * reescrever o registro de um mês já fechado, e isso não deve acontecer sem ele
 * ver os números.
 */
export function PreviousInvoiceSettlementCard({
	settlement,
	previousPeriod,
	registeredPaymentAmount,
	rolloverCharges,
}: PreviousInvoiceSettlementCardProps) {
	if (settlement.paymentStatus !== INVOICE_PAYMENT_STATUS.PARTIAL) return null;

	const debitNeedsFix =
		registeredPaymentAmount != null &&
		Math.abs(registeredPaymentAmount - settlement.paidOnPrevious) > 0.01;

	return (
		<div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 sm:px-4">
			<div className="flex flex-wrap items-center gap-2">
				<RiInformationLine className="size-4 shrink-0 text-amber-600" />
				<p className="font-medium text-sm">
					Pagamento da fatura de {displayPeriod(previousPeriod)}
				</p>
			</div>

			<p className="text-muted-foreground text-xs leading-relaxed">
				Este arquivo mostra que a fatura anterior foi paga em parte. O saldo
				restante entrou aqui como rotativo
				{rolloverCharges > 0
					? `, com ${formatCurrency(rolloverCharges)} de juros e IOF`
					: ""}
				.
			</p>

			<dl className="grid gap-2 text-sm sm:grid-cols-3">
				<div>
					<dt className="text-muted-foreground text-xs">Total da fatura</dt>
					<dd className="font-medium tabular-nums">
						{formatCurrency(settlement.previousTotal)}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">Pago</dt>
					<dd className="font-medium text-emerald-600 tabular-nums">
						{formatCurrency(settlement.paidOnPrevious)}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">
						Rolou para esta fatura
					</dt>
					<dd className="font-semibold tabular-nums">
						{formatCurrency(settlement.carriedOver)}
					</dd>
				</div>
			</dl>

			<ul className="space-y-1 text-muted-foreground text-xs leading-relaxed">
				<li>
					A fatura de {displayPeriod(previousPeriod)} passa a constar como{" "}
					<strong className="text-foreground">paga parcialmente</strong>.
				</li>
				{debitNeedsFix ? (
					<li>
						O débito na conta será corrigido de{" "}
						<span className="tabular-nums">
							{formatCurrency(registeredPaymentAmount ?? 0)}
						</span>{" "}
						para{" "}
						<span className="font-medium text-foreground tabular-nums">
							{formatCurrency(settlement.paidOnPrevious)}
						</span>{" "}
						— o valor que realmente saiu da conta.
					</li>
				) : null}
				{settlement.amortizationOnCurrent > 0 ? (
					<li>
						Os outros{" "}
						<span className="tabular-nums">
							{formatCurrency(settlement.amortizationOnCurrent)}
						</span>{" "}
						pagos no período amortizam esta fatura.
					</li>
				) : null}
			</ul>
		</div>
	);
}
