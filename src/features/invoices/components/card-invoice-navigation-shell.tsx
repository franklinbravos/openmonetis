"use client";

import type { ReactNode } from "react";
import type { PeriodCarouselMonth } from "@/shared/components/month-picker/period-carousel-types";
import { StatementPeriodNavigation } from "@/shared/components/month-picker/statement-period-navigation";
import { Card } from "@/shared/components/ui/card";

type CardInvoiceNavigationShellProps = {
	header: ReactNode;
	monthSummaries: PeriodCarouselMonth[];
};

export function CardInvoiceNavigationShell({
	header,
	monthSummaries,
}: CardInvoiceNavigationShellProps) {
	return (
		<Card className="gap-0 overflow-hidden py-0">
			<div className="border-b border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
				{header}
			</div>
			<StatementPeriodNavigation
				embedded
				hideCreateActions
				showCalendarControls
				months={monthSummaries}
			/>
		</Card>
	);
}
