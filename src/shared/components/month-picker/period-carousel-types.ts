export type PeriodCarouselStatus =
	| "paid"
	| "overdue"
	| "closed"
	| "open"
	| "future";

export type PeriodCarouselMonth = {
	period: string;
	amount: number;
	status: PeriodCarouselStatus;
	incomes?: number;
	expenses?: number;
};

export type PeriodCarouselVariant = "invoice" | "account";
