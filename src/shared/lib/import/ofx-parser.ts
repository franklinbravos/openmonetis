import { derivePeriodFromDate } from "@/shared/utils/period";
import { deriveNubankInvoicePeriodFromDueDate } from "./nubank-invoice-period";
import type {
	ImportedTransaction,
	ImportStatement,
	InvoiceImportMetadata,
	InvoiceSourceTotalKind,
} from "./types";

export type ParseOfxOptions = {
	fileName?: string;
};

const NU_PAGAMENTOS_ORG = /NU\s+PAGAMENTOS/i;
const NUBANK_FILE_DUE_DATE_RE = /Nubank_(\d{4}-\d{2}-\d{2})\./i;

const NUBANK_OFX_SKIP_DESCRIPTIONS = [/^parcelamento de fatura/i];

const NUBANK_OFX_EXPENSE_FROM_CREDIT = [/^juros de pagamento parcial/i];

// Extrai o valor de uma tag leaf do OFX SGML: <TAG>valor
function getField(block: string, tag: string): string | null {
	const match = block.match(new RegExp(`<${tag}>([^<\n\r]+)`));
	return match?.[1]?.trim() ?? null;
}

// Converte data OFX "20260320000000[-3:BRT]" para "YYYY-MM-DD"
function parseOfxDate(raw: string): string {
	const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
	if (!match) throw new Error(`Data OFX inválida: ${raw}`);
	return `${match[1]}-${match[2]}-${match[3]}`;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
	const date = new Date(`${isoDate}T12:00:00`);
	date.setDate(date.getDate() + days);
	return date.toISOString().slice(0, 10);
}

function isNubankCreditCardOfx(xml: string, isCreditCard: boolean): boolean {
	return isCreditCard && NU_PAGAMENTOS_ORG.test(xml);
}

function parseDueDateFromFileName(fileName?: string): string | null {
	if (!fileName) return null;
	const match = fileName.match(NUBANK_FILE_DUE_DATE_RE);
	return match?.[1] ?? null;
}

function parseLedgerBalance(xml: string): {
	amount: number | null;
	asOf: string | null;
} {
	const ledgerBlock = xml.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/);
	if (!ledgerBlock) return { amount: null, asOf: null };

	const balAmt = getField(ledgerBlock[0], "BALAMT");
	const dtAsOf = getField(ledgerBlock[0], "DTASOF");

	return {
		amount: balAmt
			? Math.abs(Number.parseFloat(balAmt.replace(",", ".")))
			: null,
		asOf: dtAsOf ? parseOfxDate(dtAsOf) : null,
	};
}

function buildNubankCardInvoiceMetadata(
	xml: string,
	transactions: ImportedTransaction[],
	fileName?: string,
): InvoiceImportMetadata | null {
	const dueDateFromFile = parseDueDateFromFileName(fileName);
	const { amount: ledgerAmount, asOf } = parseLedgerBalance(xml);
	const dueDate = dueDateFromFile ?? (asOf ? addDaysToIsoDate(asOf, 7) : null);

	if (!dueDate) return null;

	const paymentTxn = transactions.find((transaction) =>
		/^pagamento\s+recebido$/i.test(transaction.description.trim()),
	);

	return {
		period: deriveNubankInvoicePeriodFromDueDate(dueDate),
		dueDate,
		isPaid: Boolean(paymentTxn),
		paymentDate: paymentTxn?.date ?? null,
		totalAmount: ledgerAmount,
		totalAmountSource: "ofx_ledger",
	};
}

function postProcessNubankCardTransactions(
	transactions: ImportedTransaction[],
): ImportedTransaction[] {
	return transactions.flatMap((transaction) => {
		const description = transaction.description.trim();

		if (
			NUBANK_OFX_SKIP_DESCRIPTIONS.some((pattern) => pattern.test(description))
		) {
			return [];
		}

		if (
			transaction.transactionType === "income" &&
			NUBANK_OFX_EXPENSE_FROM_CREDIT.some((pattern) =>
				pattern.test(description),
			)
		) {
			return [{ ...transaction, transactionType: "expense" }];
		}

		return [transaction];
	});
}

export function parseOfx(
	content: string,
	options?: ParseOfxOptions,
): ImportStatement {
	// Remove o header SGML (tudo antes de <OFX>)
	const ofxStart = content.indexOf("<OFX>");
	const xml = ofxStart >= 0 ? content.slice(ofxStart) : content;

	// Banco
	const source = getField(xml, "ORG") ?? "Desconhecido";
	const accountNumber = getField(xml, "ACCTID");

	// Período
	const dtStart = getField(xml, "DTSTART");
	const dtEnd = getField(xml, "DTEND");
	const period =
		dtStart && dtEnd
			? { from: parseOfxDate(dtStart), to: parseOfxDate(dtEnd) }
			: null;

	// Transações
	const blocks = xml.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) ?? [];
	const transactions: ImportedTransaction[] = blocks.map((block) => {
		const trnType = getField(block, "TRNTYPE") ?? "DEBIT";
		const dtPosted = getField(block, "DTPOSTED") ?? "";
		const trnAmt = getField(block, "TRNAMT") ?? "0";
		const fitId = getField(block, "FITID");
		const memo = getField(block, "MEMO");
		const name = getField(block, "NAME");

		const amount = Number.parseFloat(trnAmt.replace(",", "."));
		const transactionType =
			amount > 0 || trnType === "CREDIT" ? "income" : "expense";

		return {
			externalId: fitId,
			date: parseOfxDate(dtPosted),
			amount: Math.abs(amount),
			description: memo ?? name ?? "",
			transactionType,
		};
	});

	const isCreditCard = xml.includes("<CREDITCARDMSGSRSV1>");

	if (isNubankCreditCardOfx(xml, isCreditCard)) {
		const processedTransactions =
			postProcessNubankCardTransactions(transactions);

		return {
			source: "Nubank",
			accountNumber,
			period,
			isCreditCard,
			transactions: processedTransactions,
			invoice: buildNubankCardInvoiceMetadata(
				xml,
				processedTransactions,
				options?.fileName,
			),
		};
	}

	return { source, accountNumber, period, isCreditCard, transactions };
}
