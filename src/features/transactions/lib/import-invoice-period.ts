import type { SelectOption } from "@/features/transactions/components/types";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import type {
	ImportStatement,
	InvoiceImportMetadata,
} from "@/shared/lib/import/types";
import { getTodayDateString } from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";

export function resolveInvoicePeriodFromMetadata(
	invoice: InvoiceImportMetadata | null | undefined,
): string | null {
	if (!invoice) return null;
	if (invoice.period) return invoice.period;
	if (invoice.dueDate) return derivePeriodFromDate(invoice.dueDate);
	return null;
}

export function resolveInvoicePeriodFromStatement(
	invoice: InvoiceImportMetadata | null | undefined,
	transactions: Array<{ date: string }>,
	cardOption: SelectOption | null,
): string | null {
	const fromMetadata = resolveInvoicePeriodFromMetadata(invoice);
	if (fromMetadata) return fromMetadata;

	if (!cardOption?.closingDay || transactions.length === 0) return null;

	const latestDate = [...transactions]
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

export function resolveImportPaymentDate(
	invoice: InvoiceImportMetadata | null | undefined,
): string {
	if (invoice?.paymentDate) return invoice.paymentDate;
	if (invoice?.dueDate) return invoice.dueDate;
	return getTodayDateString();
}

/** Período da fatura para vincular o lote/arquivo — prioriza o conteúdo do arquivo. */
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

	const fromFile = stmt.isCreditCard
		? resolveInvoicePeriodFromStatement(
				stmt.invoice,
				stmt.transactions,
				options.selectedCardOption ?? null,
			)
		: null;

	return fromFile ?? options.fallbackPeriod ?? null;
}
