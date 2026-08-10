import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { formatPeriodForUrl } from "@/shared/utils/period";

export function buildImportContinueHref(
	entry: Pick<
		ImportFileHistoryEntry,
		"id" | "cardId" | "invoicePeriod" | "accountId"
	>,
): string {
	const params = new URLSearchParams();

	if (entry.cardId) {
		params.set("cartao", entry.cardId);
	}

	if (entry.accountId && !entry.cardId) {
		params.set("conta", entry.accountId);
	}

	if (entry.invoicePeriod) {
		params.set("periodo", entry.invoicePeriod);
	}

	params.set("lote", entry.id);

	const query = params.toString();
	return query ? `/transactions/import?${query}` : "/transactions/import";
}

/** Navegação ao retomar rascunho — `retomar` força remount mesmo com o mesmo `lote`. */
export function buildImportResumeHref(
	entry: Parameters<typeof buildImportContinueHref>[0],
): string {
	const params = new URLSearchParams(
		buildImportContinueHref(entry).split("?")[1] ?? "",
	);
	params.set("retomar", String(Date.now()));
	return `/transactions/import?${params.toString()}`;
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

export function buildAccountImportHistoryHref(accountId: string): string {
	const params = new URLSearchParams();
	params.set("conta", accountId);
	return `/transactions/import/history?${params.toString()}`;
}

export function buildAccountImportHref(
	accountId: string,
	period?: string | null,
): string {
	const params = new URLSearchParams();
	params.set("conta", accountId);

	if (period) {
		params.set("periodo", period);
	}

	return `/transactions/import?${params.toString()}`;
}

export function buildImportLandingHref(input: {
	cardId?: string | null;
	accountId?: string | null;
	invoicePeriod?: string | null;
}): string {
	const params = new URLSearchParams();

	if (input.cardId) {
		params.set("cartao", input.cardId);
	}

	if (input.accountId && !input.cardId) {
		params.set("conta", input.accountId);
	}

	if (input.invoicePeriod) {
		params.set("periodo", input.invoicePeriod);
	}

	const query = params.toString();
	return query ? `/transactions/import?${query}` : "/transactions/import";
}

export function buildAccountStatementHref(
	accountId: string,
	period: string,
): string {
	return `/accounts/${accountId}/statement?periodo=${formatPeriodForUrl(period)}`;
}
