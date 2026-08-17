import type { SelectOption } from "@/features/transactions/components/types";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import { buildPeriodFromTransactions } from "@/shared/lib/import/helpers";
import type {
	ImportStatement,
	ImportedTransaction,
	InvoiceImportMetadata,
} from "@/shared/lib/import/types";
import { getTodayDateString } from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";

export type AccountStatementDateRange = {
	from: string;
	to: string;
};

/** Metadados de fatura (PDF/OFX de cartão) → período YYYY-MM. */
export function resolveCreditCardInvoicePeriodFromMetadata(
	invoice: InvoiceImportMetadata | null | undefined,
): string | null {
	if (!invoice) return null;
	if (invoice.period) return invoice.period;
	if (invoice.dueDate) return derivePeriodFromDate(invoice.dueDate);
	return null;
}

/** Período YYYY-MM da fatura a partir do extrato de cartão. */
export function resolveCreditCardInvoicePeriodFromStatement(
	statement: ImportStatement,
	cardOption: SelectOption | null,
): string | null {
	if (!statement.isCreditCard) return null;

	const fromMetadata = resolveCreditCardInvoicePeriodFromMetadata(
		statement.invoice,
	);
	if (fromMetadata) return fromMetadata;

	if (!cardOption?.closingDay || statement.transactions.length === 0) {
		return null;
	}

	const latestDate = [...statement.transactions]
		.map((transaction) => transaction.date)
		.sort()
		.at(-1);

	if (!latestDate) return null;

	return deriveCreditCardPeriod(
		latestDate,
		cardOption.closingDay,
		cardOption.dueDay,
	);
}

export function resolveCreditCardInvoicePeriodFromImportStatement(
	statement: ImportStatement,
	cardOptions: SelectOption[],
	cardId?: string | null,
): string | null {
	if (!statement.isCreditCard) return null;

	const cardOption = cardId
		? (cardOptions.find((option) => option.value === cardId) ?? null)
		: null;

	return resolveCreditCardInvoicePeriodFromStatement(statement, cardOption);
}

/** Intervalo de datas do extrato bancário (conta corrente). */
export function resolveAccountStatementDateRange(
	statement: ImportStatement,
): AccountStatementDateRange | null {
	if (statement.isCreditCard) return null;

	return (
		statement.period ?? buildPeriodFromTransactions(statement.transactions)
	);
}

export function resolveImportPaymentDate(
	invoice: InvoiceImportMetadata | null | undefined,
): string {
	if (invoice?.paymentDate) return invoice.paymentDate;
	if (invoice?.dueDate) return invoice.dueDate;
	return getTodayDateString();
}

/** Período YYYY-MM para vincular lote de importação de fatura de cartão. */
export function resolveUploadInvoicePeriodFromStatement(
	stmt: ImportStatement,
	options: {
		selectedCardOption?: SelectOption | null;
		fallbackPeriod?: string | null;
		filePeriodOverride?: string | null;
	},
): string | null {
	if (options.filePeriodOverride) {
		return options.filePeriodOverride;
	}

	if (!stmt.isCreditCard) {
		return options.fallbackPeriod ?? null;
	}

	const fromFile = resolveCreditCardInvoicePeriodFromStatement(
		stmt,
		options.selectedCardOption ?? null,
	);

	return fromFile ?? options.fallbackPeriod ?? null;
}

/** @deprecated Use resolveCreditCardInvoicePeriodFromMetadata */
export const resolveInvoicePeriodFromMetadata =
	resolveCreditCardInvoicePeriodFromMetadata;

/** @deprecated Use resolveCreditCardInvoicePeriodFromStatement */
export function resolveInvoicePeriodFromStatement(
	invoice: InvoiceImportMetadata | null | undefined,
	transactions: Array<{ date: string }>,
	cardOption: SelectOption | null,
): string | null {
	return resolveCreditCardInvoicePeriodFromStatement(
		{
			source: "",
			accountNumber: null,
			period: null,
			isCreditCard: true,
			transactions: transactions as ImportedTransaction[],
			invoice: invoice ?? null,
		},
		cardOption,
	);
}
