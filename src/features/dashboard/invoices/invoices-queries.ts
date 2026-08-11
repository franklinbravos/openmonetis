import { and, eq, ilike } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	INVOICE_STATUS_VALUES,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { callRpc } from "@/shared/lib/supabase/rpc";
import {
	buildDateOnlyStringFromPeriodDay,
	compareDateOnly,
	getBusinessDateString,
	isDateOnlyPast,
	parseUtcDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { calculatePercentageChange } from "@/shared/utils/math";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import { getPreviousPeriod } from "@/shared/utils/period";

type RawDashboardInvoice = {
	invoiceId: string | null;
	cardId: string;
	cardName: string;
	cardBrand: string | null;
	cardStatus: string | null;
	logo: string | null;
	dueDay: string;
	period: string | null;
	paymentStatus: string | null;
	totalAmount: string | number | null;
	transactionCount: string | number | null;
	invoiceCreatedAt: Date | string | null;
	cardAccountId: string | null;
};

export type DashboardInvoiceRpcRow = {
	invoice_id: string | null;
	card_id: string;
	card_name: string;
	card_brand: string | null;
	card_status: string | null;
	logo: string | null;
	due_day: string;
	period: string | null;
	payment_status: string | null;
	invoice_created_at: string | null;
	card_account_id: string | null;
	total_amount: string | number | null;
	transaction_count: string | number | null;
};

export type InvoicePaymentAccountOption = {
	value: string;
	label: string;
	logo: string | null;
};

export type RawInvoiceBreakdownRow = {
	cardId: string | null;
	period: string | null;
	payerId: string | null;
	pagadorName: string | null;
	pagadorAvatar: string | null;
	amount: number | string | null;
};

type InvoiceBreakdownRpcRow = {
	card_id: string | null;
	period: string | null;
	payer_id: string | null;
	pagador_name: string | null;
	pagador_avatar: string | null;
	amount: string | number | null;
};

export type InvoicePagadorBreakdown = {
	payerId: string | null;
	pagadorName: string;
	pagadorAvatar: string | null;
	amount: number;
	percentageChange: number | null;
};

export type DashboardInvoice = {
	id: string;
	cardId: string;
	cardName: string;
	cardBrand: string | null;
	cardStatus: string | null;
	logo: string | null;
	dueDay: string;
	period: string;
	paymentStatus: InvoicePaymentStatus;
	totalAmount: number;
	paidAt: string | null;
	pagadorBreakdown: InvoicePagadorBreakdown[];
	defaultPaymentAccountId: string | null;
};

type DashboardInvoicesSnapshot = {
	invoices: DashboardInvoice[];
	totalPending: number;
	paymentAccountOptions: InvoicePaymentAccountOption[];
};

const isInvoiceStatus = (value: unknown): value is InvoicePaymentStatus =>
	typeof value === "string" &&
	(INVOICE_STATUS_VALUES as string[]).includes(value);

const buildFallbackId = (cardId: string, period: string) =>
	`${cardId}:${period}`;

const compareDateOnlyAscWithNullsLast = (
	left: string | null,
	right: string | null,
) => {
	if (!left && !right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	return compareDateOnly(left, right);
};

const compareDateOnlyDescWithNullsLast = (
	left: string | null,
	right: string | null,
) => {
	if (!left && !right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	return compareDateOnly(right, left);
};

const mapDashboardInvoiceRow = (
	row: DashboardInvoiceRpcRow,
): RawDashboardInvoice => ({
	invoiceId: row.invoice_id,
	cardId: row.card_id,
	cardName: row.card_name,
	cardBrand: row.card_brand,
	cardStatus: row.card_status,
	logo: row.logo,
	dueDay: row.due_day,
	period: row.period,
	paymentStatus: row.payment_status,
	totalAmount: row.total_amount,
	transactionCount: row.transaction_count,
	invoiceCreatedAt: row.invoice_created_at,
	cardAccountId: row.card_account_id,
});

const mapInvoiceBreakdownRow = (
	row: InvoiceBreakdownRpcRow,
): RawInvoiceBreakdownRow => ({
	cardId: row.card_id,
	period: row.period,
	payerId: row.payer_id,
	pagadorName: row.pagador_name,
	pagadorAvatar: row.pagador_avatar,
	amount: row.amount,
});

export function buildInvoicePagadorBreakdown(
	rows: RawInvoiceBreakdownRow[],
	period: string,
	previousPeriod: string,
): Map<string, InvoicePagadorBreakdown[]> {
	const groupedBreakdown = new Map<
		string,
		{
			cardId: string;
			payerId: string | null;
			pagadorName: string;
			pagadorAvatar: string | null;
			currentAmount: number;
			previousAmount: number;
		}
	>();

	for (const row of rows) {
		if (!row.cardId) {
			continue;
		}

		const resolvedPeriod = row.period ?? period;
		const amount = Math.abs(toNumber(row.amount));
		if (amount <= 0) {
			continue;
		}

		const payerId = row.payerId ?? null;
		const pagadorName = row.pagadorName?.trim() || "Sem pessoa";
		const pagadorAvatar = row.pagadorAvatar ?? null;
		const payerKey = payerId ?? "__without-payer__";
		const key = `${row.cardId}:${payerKey}`;
		const current = groupedBreakdown.get(key) ?? {
			cardId: row.cardId,
			payerId,
			pagadorName,
			pagadorAvatar,
			currentAmount: 0,
			previousAmount: 0,
		};

		if (resolvedPeriod === period) {
			current.payerId = payerId;
			current.pagadorName = pagadorName;
			current.pagadorAvatar = pagadorAvatar;
			current.currentAmount = amount;
		}

		if (resolvedPeriod === previousPeriod) {
			current.previousAmount = amount;
		}

		groupedBreakdown.set(key, current);
	}

	const breakdownMap = new Map<string, InvoicePagadorBreakdown[]>();
	for (const share of groupedBreakdown.values()) {
		if (share.currentAmount <= 0) {
			continue;
		}

		const key = `${share.cardId}:${period}`;
		const current = breakdownMap.get(key) ?? [];
		current.push({
			payerId: share.payerId,
			pagadorName: share.pagadorName,
			pagadorAvatar: share.pagadorAvatar,
			amount: share.currentAmount,
			percentageChange: calculatePercentageChange(
				share.currentAmount,
				share.previousAmount,
			),
		});
		breakdownMap.set(key, current);
	}

	return breakdownMap;
}

export async function fetchDashboardInvoices(
	userId: string,
	period: string,
): Promise<DashboardInvoicesSnapshot> {
	const today = getBusinessDateString();
	const previousPeriod = getPreviousPeriod(period);
	const paymentRows = await db
		.select({
			note: transactions.note,
			purchaseDate: transactions.purchaseDate,
			createdAt: transactions.createdAt,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				ilike(transactions.note, `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`),
			),
		);

	const paymentMap = new Map<string, string>();
	for (const row of paymentRows) {
		const note = row.note;
		if (!note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX)) {
			continue;
		}
		const parts = note.split(":");
		if (parts.length < 3) {
			continue;
		}
		const cardIdPart = parts[1];
		const periodPart = parts[2];
		if (!cardIdPart || !periodPart) {
			continue;
		}
		const key = `${cardIdPart}:${periodPart}`;
		const resolvedDate =
			row.purchaseDate instanceof Date &&
			!Number.isNaN(row.purchaseDate.valueOf())
				? row.purchaseDate
				: row.createdAt;
		const isoDate = toDateOnlyString(resolvedDate);
		if (!isoDate) {
			continue;
		}
		const existing = paymentMap.get(key);
		if (!existing || existing < isoDate) {
			paymentMap.set(key, isoDate);
		}
	}

	const [rawInvoiceRows, rawBreakdownRows, accountRows] = await Promise.all([
		callRpc<DashboardInvoiceRpcRow>("get_dashboard_invoices", {
			p_user_id: userId,
			p_period: period,
		}),
		callRpc<InvoiceBreakdownRpcRow>("get_invoice_payer_breakdown", {
			p_user_id: userId,
			p_period: period,
			p_previous_period: previousPeriod,
		}),
		db
			.select({
				id: financialAccounts.id,
				name: financialAccounts.name,
				logo: financialAccounts.logo,
			})
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, userId)),
	]);

	const rows = rawInvoiceRows.map(mapDashboardInvoiceRow);
	const breakdownRows = rawBreakdownRows.map(mapInvoiceBreakdownRow);

	const paymentAccountOptions: InvoicePaymentAccountOption[] = accountRows
		.map((account) => ({
			value: account.id,
			label: account.name,
			logo: account.logo,
		}))
		.sort((a, b) =>
			a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
		);

	const breakdownMap = buildInvoicePagadorBreakdown(
		breakdownRows,
		period,
		previousPeriod,
	);

	const invoiceList: DashboardInvoice[] = [];

	for (const row of rows) {
		if (!row) {
			continue;
		}

		const totalAmount = toNumber(row.totalAmount);
		const transactionCount = toNumber(row.transactionCount);
		const paymentStatus = isInvoiceStatus(row.paymentStatus)
			? row.paymentStatus
			: INVOICE_PAYMENT_STATUS.PENDING;

		const shouldInclude =
			transactionCount > 0 ||
			Math.abs(totalAmount) > 0 ||
			row.invoiceId !== null;

		if (!shouldInclude) {
			continue;
		}

		const resolvedPeriod = row.period ?? period;
		const paymentKey = `${row.cardId}:${resolvedPeriod}`;
		const paidAt =
			paymentStatus === INVOICE_PAYMENT_STATUS.PAID
				? (paymentMap.get(paymentKey) ?? toDateOnlyString(row.invoiceCreatedAt))
				: null;

		invoiceList.push({
			id: row.invoiceId ?? buildFallbackId(row.cardId, period),
			cardId: row.cardId,
			cardName: row.cardName,
			cardBrand: row.cardBrand,
			cardStatus: row.cardStatus,
			logo: row.logo,
			dueDay: row.dueDay,
			period: resolvedPeriod,
			paymentStatus,
			totalAmount,
			paidAt,
			pagadorBreakdown: (
				breakdownMap.get(`${row.cardId}:${resolvedPeriod}`) ?? []
			).sort((a, b) => b.amount - a.amount),
			defaultPaymentAccountId: row.cardAccountId ?? null,
		});
	}

	invoiceList.sort((a, b) => {
		const aIsPending = a.paymentStatus === INVOICE_PAYMENT_STATUS.PENDING;
		const bIsPending = b.paymentStatus === INVOICE_PAYMENT_STATUS.PENDING;
		if (aIsPending !== bIsPending) {
			return aIsPending ? -1 : 1;
		}

		if (aIsPending && bIsPending) {
			const urgencyRank = (invoice: DashboardInvoice) => {
				const dueDate = buildDateOnlyStringFromPeriodDay(
					invoice.period,
					invoice.dueDay,
				);
				if (!dueDate) return 4;
				if (isDateOnlyPast(dueDate, today)) return 3;
				if (dueDate === today) return 0;
				const tomorrow = parseUtcDateString(today);
				if (tomorrow) {
					tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
					const tomorrowValue = toDateOnlyString(tomorrow);
					if (tomorrowValue && dueDate === tomorrowValue) return 1;
				}
				return 2;
			};

			const urgencyDiff = urgencyRank(a) - urgencyRank(b);
			if (urgencyDiff !== 0) {
				return urgencyDiff;
			}

			const aDueDate = buildDateOnlyStringFromPeriodDay(a.period, a.dueDay);
			const bDueDate = buildDateOnlyStringFromPeriodDay(b.period, b.dueDay);
			const dueDateDiff = compareDateOnlyAscWithNullsLast(aDueDate, bDueDate);
			if (dueDateDiff !== 0) {
				return dueDateDiff;
			}

			const amountDiff = Math.abs(b.totalAmount) - Math.abs(a.totalAmount);
			if (amountDiff !== 0) {
				return amountDiff;
			}
		}

		if (!aIsPending && !bIsPending) {
			const paidAtDiff = compareDateOnlyDescWithNullsLast(a.paidAt, b.paidAt);
			if (paidAtDiff !== 0) {
				return paidAtDiff;
			}

			const amountDiff = Math.abs(b.totalAmount) - Math.abs(a.totalAmount);
			if (amountDiff !== 0) {
				return amountDiff;
			}
		}

		const nameDiff = a.cardName.localeCompare(b.cardName, "pt-BR", {
			sensitivity: "base",
		});
		if (nameDiff !== 0) {
			return nameDiff;
		}

		return a.id.localeCompare(b.id);
	});

	const totalPending = invoiceList.reduce((total, invoice) => {
		if (invoice.paymentStatus !== INVOICE_PAYMENT_STATUS.PENDING) {
			return total;
		}
		return total + invoice.totalAmount;
	}, 0);

	return {
		invoices: invoiceList,
		totalPending,
		paymentAccountOptions,
	};
}
