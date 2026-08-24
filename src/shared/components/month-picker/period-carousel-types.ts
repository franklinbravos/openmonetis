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
	/**
	 * Valor efetivamente pago, quando difere do total.
	 *
	 * Preenchido só na fatura paga em parte: nos meses quitados ele é o próprio
	 * total, e nos futuros seria R$ 0,00 — que leria como "nada a pagar".
	 */
	paidAmount?: number | null;
	status: PeriodCarouselStatus;
	incomes?: number;
	expenses?: number;
};

export type PeriodCarouselVariant = "invoice" | "account";
