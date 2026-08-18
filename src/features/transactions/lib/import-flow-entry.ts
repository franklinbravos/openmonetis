/**
 * Key de montagem do assistente: retomar o mesmo lote duas vezes precisa
 * remontar, e cada contexto de cartão/conta/período é um assistente distinto.
 */
export function buildImportMountKey({
	resumeBatchId,
	remountNonce,
	cardId,
	accountId,
	invoicePeriod,
}: {
	resumeBatchId: string | null;
	remountNonce: string | null;
	cardId: string | null;
	accountId: string | null;
	invoicePeriod: string | null;
}): string {
	if (resumeBatchId) {
		return `resume:${resumeBatchId}:${remountNonce ?? "0"}`;
	}

	return [
		"import",
		cardId ?? "no-card",
		accountId ?? "no-account",
		invoicePeriod ?? "no-period",
	].join(":");
}
