import { derivePeriodFromDate } from "@/shared/utils/period";
import { parseBrazilianAmount } from "../helpers";
import type {
	ImportedTransaction,
	InvoiceImportMetadata,
	InvoiceSourceTotalKind,
} from "../types";

export function buildInvoiceMetadataFromDueDate(
	dueDate: string | null,
	options: {
		isPaid?: boolean;
		paymentDate?: string | null;
		totalAmount?: number | null;
		totalAmountSource?: InvoiceSourceTotalKind | null;
		financeChargesTotal?: number | null;
		financeChargesLabel?: string | null;
	},
): InvoiceImportMetadata | null {
	if (!dueDate) return null;

	return {
		period: derivePeriodFromDate(dueDate),
		dueDate,
		isPaid: options.isPaid ?? false,
		paymentDate: options.paymentDate ?? null,
		totalAmount: options.totalAmount ?? null,
		totalAmountSource: options.totalAmountSource ?? null,
		financeChargesTotal: options.financeChargesTotal ?? null,
		financeChargesLabel: options.financeChargesLabel ?? null,
	};
}

/** Razão mínima cabeçalho/linhas para tratar o total do PDF como valor errado (ex.: limite de crédito). */
const SUSPICIOUS_HEADER_OVER_LINES_RATIO = 2;

export function resolvePdfTotalMetadata(
	parsedTotal: number | null,
	transactionTotal: number,
): Pick<InvoiceImportMetadata, "totalAmount" | "totalAmountSource"> {
	if (parsedTotal != null && transactionTotal > 0) {
		const headerLooksLikeWrongField =
			parsedTotal > transactionTotal &&
			parsedTotal / transactionTotal > SUSPICIOUS_HEADER_OVER_LINES_RATIO;

		if (headerLooksLikeWrongField) {
			return {
				totalAmount: transactionTotal,
				totalAmountSource: "pdf_lines_fallback",
			};
		}
	}

	if (parsedTotal != null) {
		return {
			totalAmount: parsedTotal,
			totalAmountSource: "pdf_header",
		};
	}

	if (transactionTotal > 0) {
		return {
			totalAmount: transactionTotal,
			totalAmountSource: "pdf_lines_fallback",
		};
	}

	return {
		totalAmount: null,
		totalAmountSource: null,
	};
}

export function matchFirstBrazilianAmount(
	text: string,
	patterns: RegExp[],
): number | null {
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (!match?.[1]) continue;
		const amount = parseBrazilianAmount(match[1]);
		if (amount > 0) return amount;
	}
	return null;
}

export function sumImportedTransactionAmounts(
	transactions: ImportedTransaction[],
): number {
	return transactions.reduce(
		(total, transaction) => total + transaction.amount,
		0,
	);
}
