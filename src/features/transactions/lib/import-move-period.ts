const PERIOD_LOCKED_CONDITIONS = new Set(["parcelado", "recorrente"]);

export type MovableTransactionSnapshot = {
	condition: string;
	installmentCount: number | null;
	recurrenceCount: number | null;
};

/**
 * Parcelas e ocorrências recorrentes pertencem ao mês em que caem: reescrever o
 * período quebraria a série. Qualquer sinal de série basta — linhas incompletas
 * não devem passar.
 */
export function isPeriodLockedTransaction(
	transaction: MovableTransactionSnapshot,
): boolean {
	return (
		PERIOD_LOCKED_CONDITIONS.has(transaction.condition.trim().toLowerCase()) ||
		transaction.installmentCount != null ||
		transaction.recurrenceCount != null
	);
}

type PeriodLockedCandidate = {
	id: string;
	condition?: string | null;
	installmentCount: number | null;
	recurrenceCount?: number | null;
};

/**
 * Ids dos cadastros que a importação não pode mover de período, para a revisão
 * não oferecer uma ação que o servidor recusa.
 */
export function collectPeriodLockedTransactionIds(
	candidates: PeriodLockedCandidate[],
): Set<string> {
	const ids = new Set<string>();

	for (const candidate of candidates) {
		const locked = isPeriodLockedTransaction({
			condition: candidate.condition ?? "",
			installmentCount: candidate.installmentCount,
			recurrenceCount: candidate.recurrenceCount ?? null,
		});
		if (locked) ids.add(candidate.id);
	}

	return ids;
}
