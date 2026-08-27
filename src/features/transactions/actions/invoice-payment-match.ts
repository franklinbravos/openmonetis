"use server";

import { eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import {
	type InvoiceAmountCandidate,
	matchInvoicePaymentByAmount,
} from "@/features/transactions/lib/import-invoice-payment";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { callRpcOne } from "@/shared/lib/supabase/rpc";
import { buildDateOnlyStringFromPeriodDay } from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import { addMonthsToPeriod, derivePeriodFromDate } from "@/shared/utils/period";

export type InvoicePaymentMatchInput = {
	/** Identifica a linha na resposta. */
	key: string;
	amount: number;
	/** Data do pagamento, `YYYY-MM-DD`. */
	date: string;
};

export type InvoicePaymentMatch = {
	cardId: string;
	period: string;
};

/** Meses vizinhos ao pagamento: pago adiantado, no vencimento ou em atraso. */
const PERIOD_OFFSETS = [-1, 0, 1];

/**
 * Descobre qual fatura cada pagamento do extrato quitou, pelo valor.
 *
 * O extrato do Nubank descreve o pagamento só como "Pagamento de fatura" — sem
 * cartão e sem período —, então o usuário tinha de preencher os dois à mão em
 * toda importação. Mas o valor identifica a fatura: R$ 6.003,17 em 12/01 é
 * exatamente o total da fatura Nubank de janeiro.
 *
 * Os totais são lidos uma vez por par (cartão, período), não por pagamento: um
 * extrato com três pagamentos no mesmo mês consultaria o mesmo total três vezes.
 */
export async function matchInvoicePaymentsByAmountAction(
	payments: InvoicePaymentMatchInput[],
): Promise<Record<string, InvoicePaymentMatch | null>> {
	const result: Record<string, InvoicePaymentMatch | null> = {};
	for (const payment of payments) result[payment.key] = null;

	if (payments.length === 0) return result;

	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);

		const userCards = await db
			.select({ id: cards.id, dueDay: cards.dueDay })
			.from(cards)
			.where(eq(cards.userId, dataOwnerUserId));

		if (userCards.length === 0) return result;

		const wantedPeriods = new Set<string>();
		for (const payment of payments) {
			const base = derivePeriodFromDate(payment.date);
			for (const offset of PERIOD_OFFSETS) {
				wantedPeriods.add(addMonthsToPeriod(base, offset));
			}
		}

		const candidates: InvoiceAmountCandidate[] = [];

		for (const card of userCards) {
			for (const period of wantedPeriods) {
				const totalRow = await callRpcOne<{ total: string | number | null }>(
					"get_invoice_total",
					{
						p_user_id: dataOwnerUserId,
						p_card_id: card.id,
						p_period: period,
					},
				);

				const total = Math.abs(safeToNumber(totalRow?.total));
				// Fatura sem lançamento não é candidata: casaria com pagamento zero.
				if (total <= 0.01) continue;

				candidates.push({
					cardId: card.id,
					period,
					total,
					dueDate: card.dueDay
						? buildDateOnlyStringFromPeriodDay(period, card.dueDay)
						: null,
				});
			}
		}

		for (const payment of payments) {
			result[payment.key] = matchInvoicePaymentByAmount({
				amount: payment.amount,
				paymentDate: payment.date,
				candidates,
			});
		}

		return result;
	} catch (error) {
		// Palpite é conveniência: falhar aqui não pode derrubar a revisão inteira.
		console.error("matchInvoicePaymentsByAmountAction", error);
		return result;
	}
}
