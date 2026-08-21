"use client";

import { RiCheckboxCircleLine, RiInformationLine } from "@remixicon/react";
import type { PreviousInvoiceSettlement } from "@/shared/lib/import/invoice-rollover";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { formatCurrency } from "@/shared/utils/currency";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

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
 * Aparece em toda importação de fatura, não só quando houve rotativo: todo
 * arquivo carrega o pagamento da fatura passada, e comparar esse valor com o
 * total cadastrado dela é uma validação de graça — divergência aponta
 * lançamento faltando ou valor errado no mês anterior.
 */
export function PreviousInvoiceSettlementCard({
	settlement,
	previousPeriod,
	registeredPaymentAmount,
	rolloverCharges,
}: PreviousInvoiceSettlementCardProps) {
	if (!settlement.paymentStatus) return null;

	const isPartial = settlement.paymentStatus === INVOICE_PAYMENT_STATUS.PARTIAL;
	const periodLabel = displayPeriod(previousPeriod);
	const debitNeedsFix =
		registeredPaymentAmount != null &&
		Math.abs(registeredPaymentAmount - settlement.paidOnPrevious) > 0.01;

	return (
		<div
			className={cn(
				"space-y-3 rounded-lg border px-3 py-3 sm:px-4",
				settlement.reconcilesWithPreviousTotal
					? "border-emerald-500/30 bg-emerald-500/5"
					: "border-amber-500/30 bg-amber-500/5",
			)}
		>
			<div className="flex flex-wrap items-center gap-2">
				{settlement.reconcilesWithPreviousTotal ? (
					<RiCheckboxCircleLine className="size-4 shrink-0 text-emerald-600" />
				) : (
					<RiInformationLine className="size-4 shrink-0 text-amber-600" />
				)}
				<p className="font-medium text-sm">
					Pagamento da fatura de {periodLabel}
				</p>
			</div>

			<p className="text-muted-foreground text-xs leading-relaxed">
				{isPartial
					? `Este arquivo mostra que a fatura anterior foi paga em parte. O saldo restante entrou aqui como rotativo${
							rolloverCharges > 0
								? `, com ${formatCurrency(rolloverCharges)} de juros e IOF`
								: ""
						}.`
					: "Este arquivo mostra o pagamento da fatura anterior, o que permite conferi-la contra o que está cadastrado."}
			</p>

			<dl className="grid gap-2 text-sm sm:grid-cols-3">
				<div>
					<dt className="text-muted-foreground text-xs">Total cadastrado</dt>
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
				{settlement.carriedOver > 0 ? (
					<div>
						<dt className="text-muted-foreground text-xs">
							Rolou para esta fatura
						</dt>
						<dd className="font-semibold tabular-nums">
							{formatCurrency(settlement.carriedOver)}
						</dd>
					</div>
				) : null}
			</dl>

			{settlement.reconcilesWithPreviousTotal ? null : (
				<p className="text-xs leading-relaxed text-amber-700 dark:text-amber-500">
					O arquivo diz que se pagou{" "}
					{formatCurrency(settlement.filePaymentsTotal)}, mas a fatura de{" "}
					{periodLabel} soma {formatCurrency(settlement.previousTotal)} no
					cadastro. Vale abrir aquele mês: pode faltar lançamento ou haver valor
					errado.
				</p>
			)}

			<ul className="space-y-1 text-muted-foreground text-xs leading-relaxed">
				<li>
					Ao confirmar a importação, a fatura de {periodLabel} passa a constar
					como{" "}
					<strong className="text-foreground">
						{isPartial ? "paga parcialmente" : "paga"}
					</strong>
					. A confirmação fica na última etapa, e dá para recusar.
				</li>
				{debitNeedsFix ? (
					<li>
						O débito na conta é corrigido de{" "}
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
