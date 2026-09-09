import {
	and,
	eq,
	gte,
	isNotNull,
	isNull,
	lte,
	ne,
	or,
	type SQL,
} from "drizzle-orm";
import { transactions } from "@/db/schema";
import { parseLocalDateString } from "@/shared/utils/date";
import {
	derivePeriodFromDate,
	getPeriodPurchaseDateBounds,
} from "@/shared/utils/period";

export type AccountStatementDateInput = {
	paymentMethod: string;
	isSettled: boolean | null | undefined;
	purchaseDate: string | Date | null | undefined;
	dueDate?: string | Date | null | undefined;
	boletoPaymentDate?: string | Date | null | undefined;
};

function toDateOnlyString(
	value: string | Date | null | undefined,
): string | null {
	if (!value) return null;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	if (typeof value === "string" && value.length >= 10) {
		return value.slice(0, 10);
	}
	return null;
}

/**
 * Data de referência para exibir um lançamento no extrato de conta.
 * Quitado: data de pagamento (boleto usa dt_pagamento_boleto quando houver).
 * Em aberto: vencimento, com fallback para data_compra.
 */
export function resolveAccountTransactionDisplayDate(
	input: AccountStatementDateInput,
): string | null {
	if (input.paymentMethod === "Cartão de crédito") {
		return toDateOnlyString(input.purchaseDate);
	}

	if (input.isSettled) {
		if (input.paymentMethod === "Boleto") {
			return (
				toDateOnlyString(input.boletoPaymentDate) ??
				toDateOnlyString(input.purchaseDate)
			);
		}
		return toDateOnlyString(input.purchaseDate);
	}

	return (
		toDateOnlyString(input.dueDate) ?? toDateOnlyString(input.purchaseDate)
	);
}

/** Período YYYY-MM do extrato de conta (não é o período de fatura do cartão). */
export function resolveAccountTransactionPeriod(
	input: AccountStatementDateInput,
): string {
	const displayDate = resolveAccountTransactionDisplayDate(input);
	if (!displayDate) {
		return derivePeriodFromDate();
	}
	return derivePeriodFromDate(displayDate);
}

/** Filtro por mês do extrato de conta, compatível com o drizzle-bridge (PostgREST). */
export function buildAccountTransactionDisplayDateInPeriodFilter(
	period: string,
	options?: { settledOnly?: boolean },
): SQL {
	const { start, end } = getPeriodPurchaseDateBounds(period);
	const startDate = parseLocalDateString(start);
	const endDate = parseLocalDateString(end);
	const dateInRange = (
		column:
			| typeof transactions.purchaseDate
			| typeof transactions.dueDate
			| typeof transactions.boletoPaymentDate,
	) => and(gte(column, startDate), lte(column, endDate));

	const settledBranches = [
		and(
			eq(transactions.paymentMethod, "Boleto"),
			isNotNull(transactions.boletoPaymentDate),
			dateInRange(transactions.boletoPaymentDate),
		),
		and(
			eq(transactions.paymentMethod, "Boleto"),
			isNull(transactions.boletoPaymentDate),
			dateInRange(transactions.purchaseDate),
		),
		and(
			ne(transactions.paymentMethod, "Boleto"),
			dateInRange(transactions.purchaseDate),
		),
	];

	if (options?.settledOnly) {
		return or(...settledBranches) as SQL;
	}

	const openTransaction = or(
		eq(transactions.isSettled, false),
		isNull(transactions.isSettled),
	);

	return or(
		...settledBranches.map((branch) =>
			and(eq(transactions.isSettled, true), branch),
		),
		and(
			openTransaction,
			isNotNull(transactions.dueDate),
			dateInRange(transactions.dueDate),
		),
		and(
			openTransaction,
			isNull(transactions.dueDate),
			dateInRange(transactions.purchaseDate),
		),
	) as SQL;
}

/** @deprecated Use {@link buildAccountTransactionDisplayDateInPeriodFilter}. */
export const accountTransactionDisplayDateInPeriodFilter =
	buildAccountTransactionDisplayDateInPeriodFilter;
