import {
	buildPeriodFromTransactions,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parsePortugueseAbbrevDotDate,
	parseSlashDateDMY,
} from "../helpers";
import type { ImportedTransaction, ImportStatement } from "../types";
import {
	buildInvoiceMetadataFromDueDate,
	matchFirstBrazilianAmount,
	resolvePdfTotalMetadata,
	sumImportedTransactionAmounts,
} from "./invoice-metadata";

export function isInterCardInvoice(text: string): boolean {
	return (
		/Despesas da fatura|Resumo da fatura/i.test(text) &&
		/CARTÃO\s+\d{4}\*{4}\d{4}/i.test(text)
	);
}

const INTER_CARD_PAYMENT_RE =
	/P\s*AGTO\s*DEBITO|PAGAMENTO\s+(?:EM\s+)?DEBITO|DEBITO\s+AUTOMATICO/i;

/**
 * Labels específicos da fatura de cartão Inter.
 * Evita regex genérica com flag /i + [^R], que trata "r" de "fatura" como
 * delimitador e acaba capturando "Limite de crédito total" (R$ 468) em vez
 * do total da fatura (R$ 78).
 */
const INTER_INVOICE_TOTAL_PATTERNS = [
	/Total da sua fatura\s+R\$\s*([\d.]+,\d{2})/,
	/FATURA ATUAL\s+R\$\s*([\d.]+,\d{2})/,
	/Fatura atual\s+R\$\s*([\d.]+,\d{2})/,
	/Despesas do mês\s+R\$\s*([\d.]+,\d{2})/,
	/Descritivo detalhado[\s\S]{0,120}?Fatura atual\s+R\$\s*([\d.]+,\d{2})/,
] as const;

function isInterCardPaymentForCurrentInvoice(
	paymentDate: string,
	dueDate: string,
): boolean {
	const payment = new Date(`${paymentDate}T12:00:00`);
	const due = new Date(`${dueDate}T12:00:00`);

	if (Number.isNaN(payment.getTime()) || Number.isNaN(due.getTime())) {
		return false;
	}

	return (
		payment >= due ||
		(payment.getFullYear() === due.getFullYear() &&
			payment.getMonth() === due.getMonth())
	);
}

export function parseInterCardInvoiceTotal(text: string): number | null {
	return matchFirstBrazilianAmount(text, [...INTER_INVOICE_TOTAL_PATTERNS]);
}

function parseInterCardInvoiceMetadata(
	text: string,
	transactions: ImportedTransaction[],
) {
	const dueDateMatch = text.match(
		/Data de Vencimento\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
	);
	const dueDate = dueDateMatch ? parseSlashDateDMY(dueDateMatch[1]) : null;

	const paymentMatch = text.match(
		/(\d{1,2}) de ([a-zç.]+)\s+(\d{4})\s+[^+]{0,120}P\s*AGTO\s*DEBITO[\s\S]*?\+\s*R\$\s*([\d.]+,\d{2})/i,
	);
	const parsedPaymentDate = paymentMatch
		? parsePortugueseAbbrevDotDate(
				paymentMatch[1],
				paymentMatch[2],
				paymentMatch[3],
			)
		: null;
	const isCurrentInvoicePayment =
		parsedPaymentDate !== null &&
		dueDate !== null &&
		isInterCardPaymentForCurrentInvoice(parsedPaymentDate, dueDate);
	const paymentDate = isCurrentInvoicePayment ? parsedPaymentDate : null;

	const parsedTotal = parseInterCardInvoiceTotal(text);
	const transactionTotal = sumImportedTransactionAmounts(transactions);

	const isPaid =
		isCurrentInvoicePayment ||
		/fatura\s+paga|pagamento\s+efetuado|pago em/i.test(text);

	return buildInvoiceMetadataFromDueDate(dueDate, {
		isPaid,
		paymentDate,
		...resolvePdfTotalMetadata(parsedTotal, transactionTotal),
	});
}

export function parseInterCardPdf(text: string): ImportStatement {
	if (!isInterCardInvoice(text)) {
		throw new Error("Fatura de cartão do Banco Inter não reconhecida.");
	}

	const cardMatch = text.match(/(\d{4})\*{4}(\d{4})/);
	const accountNumber = cardMatch ? `${cardMatch[1]}****${cardMatch[2]}` : null;

	const sectionStart = text.search(/Despesas da fatura/i);
	const afterStart = sectionStart >= 0 ? text.slice(sectionStart) : text;
	const endRel = afterStart.search(/Próxima fatura/i);
	const section =
		endRel >= 0 ? afterStart.slice(0, endRel) : afterStart.slice(0, 2500);

	const txnRe =
		/(\d{1,2}) de ([a-zç.]+)\s+(\d{4})\s+(.+?)\s+-\s+(\+\s*)?R\$\s*([\d.]+,\d{2})/gi;

	const transactions: ImportedTransaction[] = [];

	for (const match of section.matchAll(txnRe)) {
		if (match[5]) continue;

		const date = parsePortugueseAbbrevDotDate(match[1], match[2], match[3]);
		if (!date) continue;

		const description = match[4].replace(/\s+/g, " ").trim();
		if (
			!description ||
			INTER_CARD_PAYMENT_RE.test(description) ||
			/Total CARTÃO/i.test(description)
		) {
			continue;
		}

		const amount = parseBrazilianAmount(match[6]);
		if (amount <= 0) continue;

		transactions.push({
			externalId: makeSyntheticExternalId([date, description, String(amount)]),
			date,
			amount,
			description,
			transactionType: "expense",
		});
	}

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada na fatura do cartão Inter.");
	}

	return {
		source: "Banco Inter",
		accountNumber,
		period: buildPeriodFromTransactions(transactions),
		isCreditCard: true,
		transactions,
		invoice: parseInterCardInvoiceMetadata(text, transactions),
	};
}
