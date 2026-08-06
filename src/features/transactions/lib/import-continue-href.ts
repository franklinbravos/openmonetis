import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";

export function buildImportContinueHref(
	entry: Pick<
		ImportFileHistoryEntry,
		"id" | "cardId" | "invoicePeriod"
	>,
): string {
	const params = new URLSearchParams();

	if (entry.cardId) {
		params.set("cartao", entry.cardId);
	}

	if (entry.invoicePeriod) {
		params.set("periodo", entry.invoicePeriod);
	}

	params.set("lote", entry.id);

	const query = params.toString();
	return query ? `/transactions/import?${query}` : "/transactions/import";
}

export function buildInvoiceImportHistoryHref(
	cardId: string,
	invoicePeriod: string,
): string {
	const params = new URLSearchParams();
	params.set("cartao", cardId);
	params.set("periodo", invoicePeriod);
	return `/transactions/import/history?${params.toString()}`;
}
