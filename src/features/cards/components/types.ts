import type { InvoicePaymentStatus } from "@/shared/lib/invoices";
import {
	CARD_IMPORT_PDF_PASSWORD_RULES,
	type CardImportPdfPasswordRule,
	isCardImportPdfPasswordRule,
} from "@/shared/lib/cards/import-pdf-password";

export type Card = {
	id: string;
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	note: string | null;
	logo: string | null;
	limit: number;
	accountId: string;
	accountName: string;
	limitInUse: number;
	limitAvailable: number;
	currentInvoiceAmount: number;
	currentInvoiceLabel: string;
	currentInvoiceStatus: InvoicePaymentStatus | null;
	importPdfPasswordRule: CardImportPdfPasswordRule;
	hasImportPdfPasswordSecret: boolean;
};

export type CardFormValues = {
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	limit: string;
	note: string;
	logo: string;
	accountId: string;
	importPdfPasswordRule: CardImportPdfPasswordRule;
	importPdfPasswordSecret: string;
};
