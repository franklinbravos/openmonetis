"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveInvoiceTotal } from "@/features/invoices/hooks/use-live-invoice-total";
import {
	resolveInvoiceDisplayTotal,
	roundMoney,
} from "@/shared/lib/import/invoice-total";
import {
	InvoiceSummaryCard,
	type InvoiceSummaryCardProps,
} from "./invoice-summary-card";

type InvoiceSummaryCardLiveProps = InvoiceSummaryCardProps & {
	financialDataOwnerId: string;
	viewerUserId: string;
};

export function InvoiceSummaryCardLive({
	financialDataOwnerId,
	viewerUserId,
	totalAmount,
	reconciliation,
	...props
}: InvoiceSummaryCardLiveProps) {
	const [liveTotalAmount, setLiveTotalAmount] = useState(totalAmount);

	useEffect(() => {
		setLiveTotalAmount(totalAmount);
	}, [totalAmount]);

	useLiveInvoiceTotal({
		cardId: props.cardId,
		period: props.period,
		financialDataOwnerId,
		viewerUserId,
		onTotalChange: setLiveTotalAmount,
	});

	const liveDisplayTotalAmount = useMemo(
		() =>
			resolveInvoiceDisplayTotal({
				registeredTotal: liveTotalAmount,
				sourceTotal: reconciliation?.sourceTotal ?? null,
			}),
		[liveTotalAmount, reconciliation?.sourceTotal],
	);

	const liveReconciliation = useMemo(() => {
		if (!reconciliation || reconciliation.sourceTotal == null) {
			return reconciliation;
		}

		return {
			...reconciliation,
			delta: roundMoney(
				reconciliation.sourceTotal - Math.abs(liveTotalAmount),
			),
		};
	}, [liveTotalAmount, reconciliation]);

	return (
		<InvoiceSummaryCard
			{...props}
			totalAmount={liveTotalAmount}
			displayTotalAmount={liveDisplayTotalAmount}
			reconciliation={liveReconciliation}
		/>
	);
}
