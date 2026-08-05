"use client";

import type { ReactNode } from "react";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { Card } from "@/shared/components/ui/card";

type CardInvoiceNavigationShellProps = {
	header: ReactNode;
	toolbarSlotId?: string;
};

export function CardInvoiceNavigationShell({
	header,
	toolbarSlotId,
}: CardInvoiceNavigationShellProps) {
	return (
		<Card className="sticky top-18 z-10 gap-0 overflow-hidden py-0 backdrop-blur-md supports-backdrop-filter:bg-card/60">
			<div className="border-b border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
				{header}
			</div>
			<MonthNavigation embedded toolbarSlotId={toolbarSlotId} />
		</Card>
	);
}
