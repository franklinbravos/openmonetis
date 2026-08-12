import { and, eq, type SQL, sql } from "drizzle-orm";
import { cards, invoices, transactions } from "@/db/schema";
import { resolveInvoicePeriodCarouselStatus } from "@/features/invoices/lib/period-carousel-status";
import { fetchTransactionsWithRelations } from "@/features/transactions/queries";
import type { PeriodCarouselMonth } from "@/shared/components/month-picker/period-carousel-types";
import { buildInvoicePaymentNote } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { callRpc, callRpcOne } from "@/shared/lib/supabase/rpc";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	comparePeriods,
	getCurrentPeriod,
} from "@/shared/utils/period";

type InvoiceTotalRow = {
	total: string | number | null;
};

type InvoiceMonthSummaryRow = {
	periodo: string | null;
	total_amount: string | number | null;
};

export async function fetchCardData(userId: string, cardId: string) {
	const [card] = await db
		.select({
			id: cards.id,
			name: cards.name,
			brand: cards.brand,
			closingDay: cards.closingDay,
			dueDay: cards.dueDay,
			logo: cards.logo,
			limit: cards.limit,
			status: cards.status,
			note: cards.note,
			accountId: cards.accountId,
			importPdfPasswordRule: cards.importPdfPasswordRule,
			// Retorna apenas o booleano — o ciphertext nunca sai do servidor.
			hasImportPdfPasswordSecret: sql<boolean>`${cards.importPdfPasswordSecret} IS NOT NULL`,
		})
		.from(cards)
		.where(and(eq(cards.id, cardId), eq(cards.userId, userId)));

	return card ?? null;
}

export async function fetchInvoiceData(
	userId: string,
	cardId: string,
	selectedPeriod: string,
): Promise<{
	totalAmount: number;
	invoiceStatus: InvoicePaymentStatus;
	paymentDate: Date | null;
}> {
	const [invoiceRow, totalRow] = await Promise.all([
		db.query.invoices.findFirst({
			columns: {
				id: true,
				period: true,
				paymentStatus: true,
			},
			where: and(
				eq(invoices.cardId, cardId),
				eq(invoices.userId, userId),
				eq(invoices.period, selectedPeriod),
			),
		}),
		callRpcOne<InvoiceTotalRow>("get_invoice_total", {
			p_user_id: userId,
			p_card_id: cardId,
			p_period: selectedPeriod,
		}),
	]);

	const totalAmount = toNumber(totalRow?.total);
	const isInvoiceStatus = (
		value: string | null | undefined,
	): value is InvoicePaymentStatus =>
		!!value && ["pendente", "pago"].includes(value);

	const invoiceStatus = isInvoiceStatus(invoiceRow?.paymentStatus)
		? invoiceRow?.paymentStatus
		: INVOICE_PAYMENT_STATUS.PENDING;

	// Buscar data do pagamento se a fatura estiver paga
	let paymentDate: Date | null = null;
	if (invoiceStatus === INVOICE_PAYMENT_STATUS.PAID) {
		const invoiceNote = buildInvoicePaymentNote(cardId, selectedPeriod);
		const paymentLancamento = await db.query.transactions.findFirst({
			columns: {
				purchaseDate: true,
			},
			where: and(
				eq(transactions.userId, userId),
				eq(transactions.note, invoiceNote),
			),
		});
		paymentDate = paymentLancamento?.purchaseDate
			? new Date(paymentLancamento.purchaseDate)
			: null;
	}

	return { totalAmount, invoiceStatus, paymentDate };
}

export async function fetchCardInvoiceMonthSummaries(
	userId: string,
	cardId: string,
	closingDay: string,
	dueDay: string,
): Promise<PeriodCarouselMonth[]> {
	const [invoiceRows, amountRows] = await Promise.all([
		db.query.invoices.findMany({
			columns: {
				period: true,
				paymentStatus: true,
			},
			where: and(eq(invoices.userId, userId), eq(invoices.cardId, cardId)),
		}),
		callRpc<InvoiceMonthSummaryRow>("get_card_invoice_month_summaries", {
			p_user_id: userId,
			p_card_id: cardId,
		}),
	]);

	const amountByPeriod = new Map<string, number>();
	for (const row of amountRows) {
		if (!row.periodo) continue;
		amountByPeriod.set(row.periodo, Math.abs(toNumber(row.total_amount)));
	}

	const invoiceByPeriod = new Map<string, InvoicePaymentStatus>();
	for (const row of invoiceRows) {
		if (!row.period) continue;
		if (
			row.paymentStatus === INVOICE_PAYMENT_STATUS.PAID ||
			row.paymentStatus === INVOICE_PAYMENT_STATUS.PENDING
		) {
			invoiceByPeriod.set(row.period, row.paymentStatus);
		}
	}

	const knownPeriods = new Set<string>([
		...amountByPeriod.keys(),
		...invoiceByPeriod.keys(),
	]);

	const currentPeriod = getCurrentPeriod();
	const endPeriod = addMonthsToPeriod(currentPeriod, 2);
	const startPeriod =
		knownPeriods.size > 0
			? Array.from(knownPeriods).sort((left, right) =>
					comparePeriods(left, right),
				)[0]
			: addMonthsToPeriod(currentPeriod, -5);

	const periodRange = buildPeriodRange(startPeriod ?? currentPeriod, endPeriod);

	return periodRange.map((period) => ({
		period,
		amount: amountByPeriod.get(period) ?? 0,
		status: resolveInvoicePeriodCarouselStatus(
			period,
			invoiceByPeriod.get(period),
			closingDay,
			dueDay,
		),
	}));
}

export async function fetchCardTransactions(filters: SQL[]) {
	return fetchTransactionsWithRelations({ filters });
}
