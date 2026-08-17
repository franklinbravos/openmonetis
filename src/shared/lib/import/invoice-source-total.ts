import {
	displayInvoiceTotal,
	isInvoicePaymentDescription,
	sumSignedAmountsForImportedTransactions,
} from "@/shared/lib/import/invoice-total";
import type {
	ImportedTransaction,
	ImportStatement,
	InvoiceSourceTotalKind,
} from "@/shared/lib/import/types";

export type InvoiceSourceTotal = {
	amount: number;
	source: InvoiceSourceTotalKind;
	confidence: "high" | "inferred";
};

export function resolveInvoiceSourceTotal(
	statement: ImportStatement,
): InvoiceSourceTotal | null {
	if (!statement.isCreditCard) return null;

	const metadata = statement.invoice;
	if (metadata?.totalAmount != null && metadata.totalAmount > 0) {
		const source = metadata.totalAmountSource ?? inferMetadataSource(statement);
		return {
			amount: Math.round(metadata.totalAmount * 100) / 100,
			source,
			confidence: source === "pdf_lines_fallback" || source === "lines_fallback"
				? "inferred"
				: "high",
		};
	}

	const signedLinesTotal = sumSignedAmountsForImportedTransactions(
		statement.transactions,
	);
	const displayTotal = displayInvoiceTotal(signedLinesTotal);
	if (displayTotal <= 0) return null;

	return {
		amount: displayTotal,
		source: "lines_fallback",
		confidence: "inferred",
	};
}

function inferMetadataSource(statement: ImportStatement): InvoiceSourceTotalKind {
	if (statement.invoice?.totalAmountSource) {
		return statement.invoice.totalAmountSource;
	}

	const signedLinesTotal = sumSignedAmountsForImportedTransactions(
		statement.transactions,
	);
	const linesDisplayTotal = displayInvoiceTotal(signedLinesTotal);
	const metadataTotal = statement.invoice?.totalAmount ?? null;

	if (
		metadataTotal != null &&
		Math.abs(linesDisplayTotal - metadataTotal) <= 0.01
	) {
		return "pdf_lines_fallback";
	}

	return "ofx_ledger";
}

export function invoiceSourceTotalKindLabel(source: InvoiceSourceTotalKind): string {
	switch (source) {
		case "ofx_ledger":
			return "OFX";
		case "pdf_header":
			return "PDF";
		case "pdf_lines_fallback":
			return "PDF (inferido)";
		case "lines_fallback":
			return "Linhas do arquivo";
	}
}

export function shouldPersistInvoiceSourceTotal(
	statement: ImportStatement,
): boolean {
	return resolveInvoiceSourceTotal(statement) != null;
}

export function invoiceSourceTotalFromStatement(
	statement: ImportStatement,
): { amount: number; kind: InvoiceSourceTotalKind } | null {
	const resolved = resolveInvoiceSourceTotal(statement);
	if (!resolved) return null;
	return { amount: resolved.amount, kind: resolved.source };
}

/** Exclui pagamentos de fatura ao somar linhas do arquivo para conferência. */
export function sumDisplayTotalForImportedFileLines(
	transactions: ImportedTransaction[],
): number {
	return displayInvoiceTotal(
		sumSignedAmountsForImportedTransactions(transactions),
	);
}

export { isInvoicePaymentDescription };
