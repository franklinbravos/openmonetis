"use server";

import { and, eq, ilike } from "drizzle-orm";
import { invoices, transactions } from "@/db/schema";
import {
	buildInvoicePaymentNote,
	isInvoiceAmortizationNote,
} from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { InvoiceAmortizationEntry } from "@/shared/lib/import/invoice-rollover";
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
	/**
	 * Amortizações já registradas para esta fatura.
	 *
	 * Permite à revisão saber se o abate que o arquivo declara já está gravado —
	 * reprocessar o mesmo arquivo não deve pedir confirmação de nada.
	 */
	amortizations: InvoiceAmortizationEntry[];
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

		const [totalRow, invoice, paymentRows] = await Promise.all([
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
			// Prefixo: traz o pagamento principal e as amortizações, que levam a
			// mesma nota com sufixo `:AMORT:<data>`.
			db.query.transactions.findMany({
				columns: {
					id: true,
					amount: true,
					purchaseDate: true,
					note: true,
				},
				where: and(
					eq(transactions.userId, dataOwnerUserId),
					ilike(
						transactions.note,
						`${buildInvoicePaymentNote(input.cardId, period)}%`,
					),
				),
			}),
		]);

		const mainNote = buildInvoicePaymentNote(input.cardId, period);
		const paymentRow = paymentRows.find((row) => row.note === mainNote) ?? null;
		const amortizations: InvoiceAmortizationEntry[] = paymentRows
			.filter((row) => isInvoiceAmortizationNote(row.note))
			.flatMap((row) => {
				const date = toDateOnlyString(row.purchaseDate);
				if (!date) return [];
				return [{ date, amount: Math.abs(toNumber(row.amount)) }];
			})
			.sort((left, right) => left.date.localeCompare(right.date));

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
			amortizations,
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
