import { and, eq, type SQL, sum } from "drizzle-orm";
import { cards, invoices, transactions } from "@/db/schema";
import { fetchTransactionsWithRelations } from "@/features/transactions/queries";
import { buildInvoicePaymentNote } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { isDateOnlyPast } from "@/shared/utils/date";
import { buildDueDateInfoFromPeriodDay } from "@/shared/utils/financial-dates";

export type InvoiceMonthStatus = "paid" | "overdue";

const toNumber = (value: string | number | null | undefined) => {
	if (typeof value === "number") {
		return value;
	}
	if (value === null || value === undefined) {
		return 0;
	}
	const parsed = Number(value);
	return Number.isNaN(parsed) ? 0 : parsed;
};

export async function fetchCardData(userId: string, cardId: string) {
	const card = await db.query.cards.findFirst({
		columns: {
			id: true,
			name: true,
			brand: true,
			closingDay: true,
			dueDay: true,
			logo: true,
			limit: true,
			status: true,
			note: true,
			accountId: true,
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.id, cardId), eq(cards.userId, userId)),
	});

	return card;
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
		db
			.select({ totalAmount: sum(transactions.amount) })
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.cardId, cardId),
					eq(transactions.period, selectedPeriod),
				),
			),
	]);

	const totalAmount = toNumber(totalRow[0]?.totalAmount);
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

export async function fetchCardInvoiceMonthStatuses(
	userId: string,
	cardId: string,
	dueDay: string,
): Promise<Record<string, InvoiceMonthStatus>> {
	const [invoiceRows, periodRows] = await Promise.all([
		db.query.invoices.findMany({
			columns: {
				period: true,
				paymentStatus: true,
			},
			where: and(eq(invoices.userId, userId), eq(invoices.cardId, cardId)),
		}),
		db
			.selectDistinct({ period: transactions.period })
			.from(transactions)
			.where(
				and(eq(transactions.userId, userId), eq(transactions.cardId, cardId)),
			),
	]);

	const paidPeriods = new Set(
		invoiceRows
			.filter((row) => row.paymentStatus === INVOICE_PAYMENT_STATUS.PAID)
			.map((row) => row.period)
			.filter((period): period is string => period !== null),
	);

	const relevantPeriods = new Set(
		[
			...invoiceRows.map((row) => row.period),
			...periodRows.map((row) => row.period),
		].filter((period): period is string => period !== null),
	);

	const statuses: Record<string, InvoiceMonthStatus> = {};

	for (const period of relevantPeriods) {
		if (paidPeriods.has(period)) {
			statuses[period] = "paid";
			continue;
		}

		const dueDate = buildDueDateInfoFromPeriodDay(period, dueDay).date;
		if (dueDate && isDateOnlyPast(dueDate)) {
			statuses[period] = "overdue";
		}
	}

	return statuses;
}

export async function fetchCardTransactions(filters: SQL[]) {
	return fetchTransactionsWithRelations({ filters });
}
