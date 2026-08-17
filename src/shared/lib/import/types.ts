export type ImportedTransaction = {
	externalId: string | null; // FITID do OFX
	date: string; // YYYY-MM-DD
	amount: number; // positivo = receita, negativo = despesa
	description: string; // MEMO ou NAME
	transactionType: "income" | "expense";
	categoryRaw?: string | null;
};

export type InvoiceSourceTotalKind =
	| "ofx_ledger"
	| "pdf_header"
	| "pdf_lines_fallback"
	| "lines_fallback";

export type InvoiceImportMetadata = {
	period: string | null; // YYYY-MM (mês de vencimento da fatura)
	dueDate: string | null; // YYYY-MM-DD
	isPaid: boolean;
	paymentDate: string | null; // YYYY-MM-DD
	totalAmount: number | null;
	totalAmountSource?: InvoiceSourceTotalKind | null;
};

export type ImportStatement = {
	source: string; // nome do banco (ORG)
	accountNumber: string | null; // ACCTID
	period: { from: string; to: string } | null; // YYYY-MM-DD
	isCreditCard: boolean; // true = CREDITCARDMSGSRSV1
	transactions: ImportedTransaction[];
	invoice?: InvoiceImportMetadata | null;
};
