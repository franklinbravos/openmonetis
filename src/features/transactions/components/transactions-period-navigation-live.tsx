"use client";

import { useLiveTransactionsMonthSummaries } from "@/features/transactions/hooks/use-live-transactions-month-summaries";
import type { TransactionsViewMode } from "@/features/transactions/lib/view-mode";
import {
	StatementPeriodNavigation,
	type StatementPeriodNavigationProps,
} from "@/shared/components/month-picker/statement-period-navigation";
import type { PeriodCarouselMonth } from "@/shared/components/month-picker/period-carousel-types";

type TransactionsPeriodNavigationLiveProps = Omit<
	StatementPeriodNavigationProps,
	"months"
> & {
	initialMonths: PeriodCarouselMonth[];
	viewMode: TransactionsViewMode;
	financialDataOwnerId: string;
	viewerUserId: string;
};

export function TransactionsPeriodNavigationLive({
	initialMonths,
	viewMode,
	financialDataOwnerId,
	viewerUserId,
	...navigationProps
}: TransactionsPeriodNavigationLiveProps) {
	const months = useLiveTransactionsMonthSummaries({
		initialMonths,
		viewMode,
		financialDataOwnerId,
		viewerUserId,
	});

	return <StatementPeriodNavigation {...navigationProps} months={months} />;
}
