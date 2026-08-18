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

let remountNonceSequence = 0;

/** Sequência evita nonce repetido em dois cliques no mesmo milissegundo. */
function createRemountNonce(): string {
	remountNonceSequence += 1;
	return `${Date.now()}-${remountNonceSequence}`;
}

/** `retomar` muda a URL para forçar remount mesmo quando o resto é igual. */
function withRemountNonce(href: string): string {
	const [pathname, search] = href.split("?");
	const params = new URLSearchParams(search ?? "");
	params.set("retomar", createRemountNonce());
	return `${pathname}?${params.toString()}`;
}

export function buildImportResumeHref(
	entry: Parameters<typeof buildImportContinueHref>[0],
): string {
	return withRemountNonce(buildImportContinueHref(entry));
}

/**
 * Um mount que ainda vê `lote` tenta retomar de novo — um refresh na revisão
 * recarregaria o rascunho por cima do trabalho em andamento.
 */
export function buildImportHrefWithoutFlowParams(location: {
	pathname: string;
	search: string;
}): string {
	const params = new URLSearchParams(location.search);
	params.delete("lote");
	params.delete("retomar");

	const query = params.toString();
	return query ? `${location.pathname}?${query}` : location.pathname;
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

export function resolveTransactionsImportHref(input: {
	source?: "transactions" | "account-statement";
	period: string;
	accountId?: string | null;
	cardId?: string | null;
}): string | undefined {
	if (input.source === "account-statement" && input.accountId) {
		return buildAccountImportHref(input.accountId, input.period);
	}

	if (input.cardId) {
		return buildImportLandingHref({
			cardId: input.cardId,
			invoicePeriod: input.period,
		});
	}

	return undefined;
}

export function buildAccountStatementHref(
	accountId: string,
	period: string,
): string {
	return `/accounts/${accountId}/statement?periodo=${formatPeriodForUrl(period)}`;
}
