"use server";

import { and, eq } from "drizzle-orm";
import { invoices, transactions } from "@/db/schema";
import { buildInvoicePaymentNote } from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { callRpcOne } from "@/shared/lib/supabase/rpc";
import { parseLocalDateString, toDateOnlyString } from "@/shared/utils/date";

export type InvoiceSnapshot = {
	period: string;
	/** Total cadastrado da fatura anterior. */
	total: number;
	paymentStatus: string | null;
	/** Débito na conta gravado como pagamento dessa fatura, se houver. */
	paymentTransactionId: string | null;
	paymentTransactionAmount: number | null;
	/** Data do débito registrado, em `YYYY-MM-DD`. */
	paymentTransactionDate: string | null;
};

function toNumber(value: unknown): number {
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Estado de uma fatura: total, situação e o débito registrado por ela.
 *
 * Serve a dois usos na importação — conferir como a fatura ANTERIOR foi paga, e
 * saber se a fatura sendo importada já está quitada, para não perguntar de novo
 * o que já foi feito.
 */
export async function fetchInvoiceSnapshotAction(input: {
	cardId: string;
	/** Período exato da fatura desejada. */
	period: string;
}): Promise<InvoiceSnapshot | null> {
	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);
		const period = input.period;

		const [totalRow, invoice, paymentRow] = await Promise.all([
			callRpcOne<{ total: string | number | null }>("get_invoice_total", {
				p_user_id: dataOwnerUserId,
				p_card_id: input.cardId,
				p_period: period,
			}),
			db.query.invoices.findFirst({
				columns: { paymentStatus: true },
				where: and(
					eq(invoices.userId, dataOwnerUserId),
					eq(invoices.cardId, input.cardId),
					eq(invoices.period, period),
				),
			}),
			db.query.transactions.findFirst({
				columns: { id: true, amount: true, purchaseDate: true },
				where: and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.note, buildInvoicePaymentNote(input.cardId, period)),
				),
			}),
		]);

		const total = Math.abs(toNumber(totalRow?.total));
		if (total <= 0) return null;

		return {
			period,
			total,
			paymentStatus: invoice?.paymentStatus ?? null,
			paymentTransactionId: paymentRow?.id ?? null,
			paymentTransactionAmount: paymentRow
				? Math.abs(toNumber(paymentRow.amount))
				: null,
			paymentTransactionDate: toDateOnlyString(paymentRow?.purchaseDate),
		};
	} catch (error) {
		console.error("fetchInvoiceSnapshotAction", error);
		return null;
	}
}

/**
 * Corrige a data do débito registrado como pagamento de uma fatura.
 *
 * A data real do pagamento só aparece no arquivo do mês seguinte, então a
 * correção acontece com aquele arquivo em mão. Mexe só na data — valor e status
 * têm o seu próprio caminho, na liquidação da importação.
 */
export async function updatePreviousInvoicePaymentDateAction(input: {
	transactionId: string;
	paymentDate: string;
}): Promise<{ success: boolean; error?: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);

		if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) {
			return { success: false, error: "Data inválida." };
		}

		await db
			.update(transactions)
			.set({ purchaseDate: parseLocalDateString(input.paymentDate) })
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.id, input.transactionId),
				),
			);

		await revalidateForEntity("cards", userId);
		return { success: true };
	} catch (error) {
		console.error("updatePreviousInvoicePaymentDateAction", error);
		return { success: false, error: "Não foi possível corrigir a data." };
	}
}
