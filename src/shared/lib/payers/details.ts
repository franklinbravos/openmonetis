import { and, asc, eq, ilike, isNull, not, or } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { excludeTransactionsFromExcludedAccounts } from "@/shared/lib/accounts/query-filters";
import { db } from "@/shared/lib/db";
import { callRpc, callRpcOne, toRpcNumber } from "@/shared/lib/supabase/rpc";
import { toDateOnlyString } from "@/shared/utils/date";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	formatCompactPeriodLabel,
} from "@/shared/utils/period";

const RECEITA = "Receita";
const DESPESA = "Despesa";
const PAYMENT_METHOD_CARD = "Cartão de crédito";
const PAYMENT_METHOD_BOLETO = "Boleto";

export type PayerMonthlyBreakdown = {
	totalExpenses: number;
	totalIncomes: number;
	paymentSplits: Record<"card" | "boleto" | "instant", number>;
};

export type PayerHistoryPoint = {
	period: string;
	label: string;
	receitas: number;
	despesas: number;
};

export type PayerCardUsageItem = {
	id: string;
	name: string;
	logo: string | null;
	amount: number;
};

type PayerBoletoStats = {
	totalAmount: number;
	paidAmount: number;
	pendingAmount: number;
	paidCount: number;
	pendingCount: number;
};

export type PayerBoletoItem = {
	id: string;
	name: string;
	amount: number;
	dueDate: string | null;
	boletoPaymentDate: string | null;
	isSettled: boolean;
	transactionType: string;
};

export type PayerPaymentStatusData = {
	paidAmount: number;
	paidCount: number;
	pendingAmount: number;
	pendingCount: number;
	totalAmount: number;
};

const excludeAutoInvoiceEntries = () =>
	or(
		isNull(transactions.note),
		not(ilike(transactions.note, `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`)),
	);

type BaseFilters = {
	userId: string;
	payerId: string;
	period: string;
};

type PayerMonthlyBreakdownRow = {
	payment_method: string | null;
	transaction_type: string | null;
	total_amount: string | number | null;
};

export async function fetchPayerMonthlyBreakdown({
	userId,
	payerId,
	period,
}: BaseFilters): Promise<PayerMonthlyBreakdown> {
	const rows = await callRpc<PayerMonthlyBreakdownRow>(
		"get_payer_monthly_breakdown",
		{
			p_user_id: userId,
			p_payer_id: payerId,
			p_period: period,
		},
	);

	const paymentSplits: PayerMonthlyBreakdown["paymentSplits"] = {
		card: 0,
		boleto: 0,
		instant: 0,
	};
	let totalExpenses = 0;
	let totalIncomes = 0;

	for (const row of rows) {
		const total = Math.abs(toRpcNumber(row.total_amount));
		if (row.transaction_type === DESPESA) {
			totalExpenses += total;
			if (row.payment_method === PAYMENT_METHOD_CARD) {
				paymentSplits.card += total;
			} else if (row.payment_method === PAYMENT_METHOD_BOLETO) {
				paymentSplits.boleto += total;
			} else {
				paymentSplits.instant += total;
			}
		} else if (row.transaction_type === RECEITA) {
			totalIncomes += total;
		}
	}

	return {
		totalExpenses,
		totalIncomes,
		paymentSplits,
	};
}

type PayerHistoryRow = {
	period: string | null;
	transaction_type: string | null;
	total_amount: string | number | null;
};

export async function fetchPayerHistory({
	userId,
	payerId,
	period,
	months = 6,
}: BaseFilters & { months?: number }): Promise<PayerHistoryPoint[]> {
	const startPeriod = addMonthsToPeriod(period, -(Math.max(months, 1) - 1));
	const windowPeriods = buildPeriodRange(startPeriod, period);
	const start = windowPeriods[0];
	const end = windowPeriods[windowPeriods.length - 1];

	const rows = await callRpc<PayerHistoryRow>("get_payer_history", {
		p_user_id: userId,
		p_payer_id: payerId,
		p_start_period: start,
		p_end_period: end,
	});

	const totalsByPeriod = new Map<
		string,
		{ receitas: number; despesas: number }
	>();

	for (const key of windowPeriods) {
		totalsByPeriod.set(key, { receitas: 0, despesas: 0 });
	}

	for (const row of rows) {
		const key = row.period ?? undefined;
		if (!key || !totalsByPeriod.has(key)) continue;
		const bucket = totalsByPeriod.get(key);
		if (!bucket) continue;
		const total = Math.abs(toRpcNumber(row.total_amount));
		if (row.transaction_type === DESPESA) {
			bucket.despesas += total;
		} else if (row.transaction_type === RECEITA) {
			bucket.receitas += total;
		}
	}

	return windowPeriods.map((key) => ({
		period: key,
		label: formatCompactPeriodLabel(key),
		receitas: totalsByPeriod.get(key)?.receitas ?? 0,
		despesas: totalsByPeriod.get(key)?.despesas ?? 0,
	}));
}

type PayerCardUsageRow = {
	card_id: string | null;
	card_name: string | null;
	card_logo: string | null;
	total_amount: string | number | null;
};

export async function fetchPayerCardUsage({
	userId,
	payerId,
	period,
}: BaseFilters): Promise<PayerCardUsageItem[]> {
	const rows = await callRpc<PayerCardUsageRow>("get_payer_card_usage", {
		p_user_id: userId,
		p_payer_id: payerId,
		p_period: period,
	});

	const items: PayerCardUsageItem[] = [];

	for (const row of rows) {
		if (!row.card_id) {
			continue;
		}

		items.push({
			id: row.card_id,
			name: row.card_name ?? "Cartão",
			logo: row.card_logo ?? null,
			amount: Math.abs(toRpcNumber(row.total_amount)),
		});
	}

	return items.sort((a, b) => b.amount - a.amount);
}

export type PayerBoletoStatsRow = {
	is_settled: boolean | null;
	total_amount: string | number | null;
	total_count: string | number | null;
};

export function buildPayerBoletoStats(
	rows: PayerBoletoStatsRow[],
): PayerBoletoStats {
	let paidAmount = 0;
	let pendingAmount = 0;
	let paidCount = 0;
	let pendingCount = 0;

	for (const row of rows) {
		const total = Math.abs(toRpcNumber(row.total_amount));
		const count = toRpcNumber(row.total_count);
		if (row.is_settled) {
			paidAmount += total;
			paidCount += count;
		} else {
			pendingAmount += total;
			pendingCount += count;
		}
	}

	return {
		totalAmount: paidAmount + pendingAmount,
		paidAmount,
		pendingAmount,
		paidCount,
		pendingCount,
	};
}

export async function fetchPayerBoletoStats({
	userId,
	payerId,
	period,
}: BaseFilters): Promise<PayerBoletoStats> {
	const rows = await callRpc<PayerBoletoStatsRow>("get_payer_boleto_stats", {
		p_user_id: userId,
		p_payer_id: payerId,
		p_period: period,
	});

	return buildPayerBoletoStats(rows);
}

export async function fetchPayerBoletoItems({
	userId,
	payerId,
	period,
}: BaseFilters): Promise<PayerBoletoItem[]> {
	const rows = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			dueDate: transactions.dueDate,
			boletoPaymentDate: transactions.boletoPaymentDate,
			isSettled: transactions.isSettled,
			transactionType: transactions.transactionType,
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, payerId),
				eq(transactions.period, period),
				eq(transactions.paymentMethod, PAYMENT_METHOD_BOLETO),
				excludeAutoInvoiceEntries(),
				excludeTransactionsFromExcludedAccounts(),
			),
		)
		.orderBy(asc(transactions.dueDate));

	const items: PayerBoletoItem[] = [];

	for (const row of rows) {
		items.push({
			id: row.id,
			name: row.name,
			amount: Math.abs(toRpcNumber(row.amount)),
			dueDate: toDateOnlyString(row.dueDate),
			boletoPaymentDate: toDateOnlyString(row.boletoPaymentDate),
			isSettled: Boolean(row.isSettled),
			transactionType: row.transactionType,
		});
	}

	return items;
}

type PayerPaymentStatusRow = {
	paid_amount: string | number | null;
	paid_count: string | number | null;
	pending_amount: string | number | null;
	pending_count: string | number | null;
};

export async function fetchPayerPaymentStatus({
	userId,
	payerId,
	period,
}: BaseFilters): Promise<PayerPaymentStatusData> {
	const row = await callRpcOne<PayerPaymentStatusRow>(
		"get_payer_payment_status",
		{
			p_user_id: userId,
			p_payer_id: payerId,
			p_period: period,
		},
	);

	if (!row) {
		return {
			paidAmount: 0,
			paidCount: 0,
			pendingAmount: 0,
			pendingCount: 0,
			totalAmount: 0,
		};
	}

	const paidAmount = toRpcNumber(row.paid_amount);
	const paidCount = toRpcNumber(row.paid_count);
	const pendingAmount = toRpcNumber(row.pending_amount);
	const pendingCount = toRpcNumber(row.pending_count);

	return {
		paidAmount,
		paidCount,
		pendingAmount,
		pendingCount,
		totalAmount: paidAmount + pendingAmount,
	};
}
