"use client";

import { RiBillLine } from "@remixicon/react";
import { groupDashboardInvoicesByUrgency } from "@/features/dashboard/invoices/invoices-helpers";
import type { DashboardInvoice } from "@/features/dashboard/invoices/invoices-queries";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import { cn } from "@/shared/utils/ui";
import { InvoiceListItem } from "./invoice-list-item";

type InvoicesListProps = {
	invoices: DashboardInvoice[];
	onPay: (invoiceId: string) => void;
};

export function InvoicesList({ invoices, onPay }: InvoicesListProps) {
	if (invoices.length === 0) {
		return (
			<WidgetEmptyState
				icon={<RiBillLine className="size-6 text-muted-foreground" />}
				title="Nenhuma fatura para o período selecionado"
				description="Quando houver cartões com compras registradas, eles aparecerão aqui."
			/>
		);
	}

	const groups = groupDashboardInvoicesByUrgency(invoices);

	return (
		<div className="flex flex-col gap-1">
			{groups.map((group, groupIndex) => (
				<section key={group.id} className={groupIndex > 0 ? "mt-2" : undefined}>
					<p
						className={cn(
							"px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide",
							group.headerClassName ?? "text-muted-foreground",
						)}
					>
						{group.label}
						<span className="ml-1 font-medium normal-case tracking-normal text-muted-foreground">
							({group.invoices.length})
						</span>
					</p>
					<ul className="flex flex-col">
						{group.invoices.map((invoice) => (
							<InvoiceListItem
								key={invoice.id}
								invoice={invoice}
								onPay={onPay}
							/>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
