"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Faturas que foram pagas só em parte.
 *
 * O lançamento de cartão é liquidado em bloco quando a fatura é paga, e é o que
 * deve acontecer também no pagamento parcial: o que não foi pago não fica
 * pendente, é recobrado no mês seguinte como "valor pendente do mês anterior".
 * A linha, porém, passava a dizer "Fatura paga" — afirmação que a própria tela
 * desmentia logo acima, onde a fatura consta como paga parcialmente.
 *
 * A linha sozinha não tem como saber disso: `realizado` é um booleano. Daí o
 * contexto — quem monta a tela sabe quais faturas rolaram e diz; sem provider,
 * nada muda.
 */
const PartiallyPaidInvoicesContext = createContext<ReadonlySet<string>>(
	new Set<string>(),
);

export function buildInvoiceKey(
	cardId: string | null | undefined,
	period: string | null | undefined,
): string | null {
	if (!cardId || !period) return null;
	return `${cardId}:${period}`;
}

export function PartiallyPaidInvoicesProvider({
	invoices,
	children,
}: {
	/** Pares cartão/período cuja fatura foi paga parcialmente. */
	invoices: Array<{ cardId: string; period: string }>;
	children: ReactNode;
}) {
	const value = useMemo(() => {
		const keys = new Set<string>();
		for (const invoice of invoices) {
			const key = buildInvoiceKey(invoice.cardId, invoice.period);
			if (key) keys.add(key);
		}
		return keys;
	}, [invoices]);

	return (
		<PartiallyPaidInvoicesContext.Provider value={value}>
			{children}
		</PartiallyPaidInvoicesContext.Provider>
	);
}

export function useIsPartiallyPaidInvoice(
	cardId: string | null | undefined,
	period: string | null | undefined,
): boolean {
	const invoices = useContext(PartiallyPaidInvoicesContext);
	const key = buildInvoiceKey(cardId, period);
	return key != null && invoices.has(key);
}
