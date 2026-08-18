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
