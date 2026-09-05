import { getPeriodPurchaseDateBounds } from "@/shared/utils/period";

export const TRANSACTIONS_VIEW_MODE_PARAM = "visao";

export const TRANSACTIONS_VIEW_MODES = ["competencia", "fluxo-caixa"] as const;

export type TransactionsViewMode = (typeof TRANSACTIONS_VIEW_MODES)[number];

export const DEFAULT_TRANSACTIONS_VIEW_MODE: TransactionsViewMode = "competencia";

export function parseTransactionsViewMode(
	value: string | null | undefined,
): TransactionsViewMode {
	if (value === "fluxo-caixa") {
		return "fluxo-caixa";
	}

	return DEFAULT_TRANSACTIONS_VIEW_MODE;
}

export function getTransactionsViewModeLabel(mode: TransactionsViewMode): string {
	return mode === "fluxo-caixa" ? "Fluxo de caixa" : "Competência";
}

export function getTransactionsViewModeSubtitle(mode: TransactionsViewMode): string {
	if (mode === "fluxo-caixa") {
		return "Mostra o dinheiro conforme entra ou sai do caixa — parcelas aparecem no mês do pagamento ou da fatura.";
	}

	return "Mostra despesas e receitas pela data em que foram lançadas, independentemente de quando serão pagas.";
}

export function matchesTransactionsViewMode(
	item: {
		period: string;
		purchaseDate: string;
	},
	mode: TransactionsViewMode,
	selectedPeriod: string,
): boolean {
	if (mode === "fluxo-caixa") {
		return item.period === selectedPeriod;
	}

	const { start, end } = getPeriodPurchaseDateBounds(selectedPeriod);
	const purchaseDate = item.purchaseDate.slice(0, 10);
	return purchaseDate >= start && purchaseDate <= end;
}
