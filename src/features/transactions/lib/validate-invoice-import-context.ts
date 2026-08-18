import type { SelectOption } from "@/features/transactions/components/types";
import { resolveCreditCardInvoicePeriodFromImportStatement } from "@/features/transactions/lib/import-invoice-period";
import type { ImportStatement } from "@/shared/lib/import/types";
import { displayPeriod } from "@/shared/utils/period";

export type InvoiceImportContext = {
	cardId: string;
	cardName: string;
	invoicePeriod: string;
};

export type InvoiceImportValidationResult =
	| { success: true }
	| {
			success: false;
			reason: "not_credit_card" | "period_unknown";
			error: string;
	  }
	| {
			success: false;
			reason: "period_mismatch";
			filePeriod: string;
			expectedPeriod: string;
			cardName: string;
	  };

export function validateInvoiceImportContext(
	statement: ImportStatement,
	context: InvoiceImportContext | null,
	cardOptions: SelectOption[],
): InvoiceImportValidationResult {
	if (!context) return { success: true };

	if (!statement.isCreditCard) {
		return {
			success: false,
			reason: "not_credit_card",
			error:
				"O arquivo enviado não é uma fatura de cartão de crédito. Envie o PDF da fatura correspondente ao cartão selecionado.",
		};
	}

	const periodFromFile = resolveCreditCardInvoicePeriodFromImportStatement(
		statement,
		cardOptions,
		context.cardId,
	);

	if (!periodFromFile) {
		return {
			success: false,
			reason: "period_unknown",
			error:
				"Não foi possível identificar o período da fatura no arquivo. Verifique se o PDF está completo.",
		};
	}

	if (periodFromFile !== context.invoicePeriod) {
		return {
			success: false,
			reason: "period_mismatch",
			filePeriod: periodFromFile,
			expectedPeriod: context.invoicePeriod,
			cardName: context.cardName,
		};
	}

	return { success: true };
}

export function formatInvoicePeriodMismatchMessage(
	expectedPeriod: string,
	filePeriod: string,
	cardName: string,
): string {
	return `A fatura do arquivo é de ${displayPeriod(filePeriod)}, mas você veio da fatura de ${displayPeriod(expectedPeriod)} do cartão ${cardName}.`;
}
