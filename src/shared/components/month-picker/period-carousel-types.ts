export type PeriodCarouselStatus =
	| "paid"
	/** Parte paga; o resto entrou na fatura seguinte como rotativo. */
	| "partial"
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
