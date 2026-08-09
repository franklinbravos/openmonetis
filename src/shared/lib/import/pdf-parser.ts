import { derivePeriodFromDate } from "@/shared/utils/period";
import {
	buildPeriodFromTransactions,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parsePortugueseAbbrevDotDate,
	parsePortugueseLongDate,
	parsePortugueseShortDate,
	parseSlashDateDMY,
} from "./helpers";
import { openPdfDocumentWithPassword } from "./pdf-password";
import type {
	ImportedTransaction,
	ImportStatement,
	InvoiceImportMetadata,
} from "./types";

async function openPdfDocument(
	buffer: ArrayBuffer,
	password?: string,
	extraCandidates: string[] = [],
) {
	return openPdfDocumentWithPassword(buffer, password, extraCandidates);
}

async function extractPdfText(
	buffer: ArrayBuffer,
	password?: string,
	extraCandidates: string[] = [],
): Promise<string> {
	const pdf = await openPdfDocument(buffer, password, extraCandidates);
	const pages: string[] = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		pages.push(
			content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
		);
	}

	return pages.join("\n");
}

function parseInterBankPdf(text: string): ImportStatement {
	if (!/Período:/i.test(text) && !/Saldo por transação/i.test(text)) {
		throw new Error("PDF de extrato do Banco Inter não reconhecido.");
	}

	const accountMatch = text.match(/Conta:\s*([\d-]+)/i);
	const accountNumber = accountMatch?.[1]?.replace(/\D/g, "") ?? null;

	const periodMatch = text.match(
		/Período:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
	);
	const period =
		periodMatch?.[1] && periodMatch[2]
			? {
					from: parseSlashDateDMY(periodMatch[1]),
					to: parseSlashDateDMY(periodMatch[2]),
				}
			: null;

	const transactionsStart = text.search(/Saldo por transação/i);
	const footerStart = text.search(/Fale com a gente/i);
	const section = text.slice(
		transactionsStart >= 0 ? transactionsStart : 0,
		footerStart >= 0 ? footerStart : undefined,
	);

	const transactions: ImportedTransaction[] = [];

	const dayHeaderRe =
		/(\d{1,2}) de ([A-Za-zçãéôÇÃÉÔ]+) de (\d{4})\s+Saldo do dia:\s*-?R\$\s*[\d.]+,\d{2}/gi;
	const txnRe = /(.+?)\s+(-?R\$\s*[\d.]+,\d{2})\s+-?R\$\s*[\d.]+,\d{2}/g;

	const dayMatches = [...section.matchAll(dayHeaderRe)];

	for (let index = 0; index < dayMatches.length; index++) {
		const dayMatch = dayMatches[index];
		const date = parsePortugueseLongDate(dayMatch[1], dayMatch[2], dayMatch[3]);
		if (!date) continue;

		const blockStart = (dayMatch.index ?? 0) + dayMatch[0].length;
		const blockEnd = dayMatches[index + 1]?.index ?? section.length;
		const block = section.slice(blockStart, blockEnd);

		for (const txnMatch of block.matchAll(txnRe)) {
			const description = txnMatch[1].trim();
			if (!description) continue;

			const amountSigned = parseBrazilianAmount(txnMatch[2]);
			if (amountSigned === 0) continue;

			transactions.push({
				externalId: makeSyntheticExternalId([
					date,
					String(Math.abs(amountSigned)),
					description,
				]),
				date,
				amount: Math.abs(amountSigned),
				description,
				transactionType: amountSigned > 0 ? "income" : "expense",
			});
		}
	}

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada no PDF.");
	}

	const resolvedPeriod =
		period?.from && period.to
			? { from: period.from, to: period.to }
			: buildPeriodFromTransactions(transactions);

	return {
		source: "Banco Inter",
		accountNumber,
		period: resolvedPeriod,
		isCreditCard: false,
		transactions,
	};
}

function isItauCardInvoice(text: string): boolean {
	const normalized = text.toLowerCase();
	return (
		/itau|itaú/.test(normalized) &&
		/lan[cç]amentos/i.test(text) &&
		(/compras e saques|produtos e servi[cç]os/i.test(text) ||
			/data\s+estabelecimento\s+valor/i.test(text))
	);
}

const ITAU_SECTION_END_RE =
	/compras parceladas|lan[cç]amentos internacionais|resumo da fatura|demais faturas|total desta fatura|pagamento efetuado|limites de cr[eé]dito/i;

const ITAU_PAYMENT_RE =
	/pagamento\s+efetuado|pagamento\s+recebido|cr[eé]dito\s+do\s+cart[aã]o/i;

function inferItauTransactionYear(
	month: number,
	dueDate: string | null,
): number {
	if (!dueDate) return new Date().getFullYear();
	const due = new Date(`${dueDate}T12:00:00`);
	if (Number.isNaN(due.getTime())) return new Date().getFullYear();

	const dueMonth = due.getMonth() + 1;
	const dueYear = due.getFullYear();

	// Compras costumam ser do ciclo anterior ao vencimento; se o mês da compra
	// for maior que o do vencimento, provavelmente é do ano anterior.
	if (month > dueMonth) return dueYear - 1;
	return dueYear;
}

function parseItauSlashDate(
	raw: string,
	dueDate: string | null,
): string | null {
	const match = raw.trim().match(/^(\d{2})\/(\d{2})$/);
	if (!match) return null;

	const day = Number.parseInt(match[1], 10);
	const month = Number.parseInt(match[2], 10);
	const year = inferItauTransactionYear(month, dueDate);

	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseItauCardSection(
	section: string,
	dueDate: string | null,
): ImportedTransaction[] {
	const transactions: ImportedTransaction[] = [];
	const lines = section
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	const lineTxnRe = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/;

	for (const line of lines) {
		if (
			/^data\b/i.test(line) ||
			/^total\b/i.test(line) ||
			ITAU_PAYMENT_RE.test(line) ||
			/^cr[eé]dito\b/i.test(line) ||
			/^d[eé]bito\b/i.test(line)
		) {
			continue;
		}

		const match = line.match(lineTxnRe);
		if (!match) continue;

		const date = parseItauSlashDate(match[1], dueDate);
		if (!date) continue;

		const description = match[2]
			.replace(/\s+\d{2}\/\d{2}$/, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!description || ITAU_PAYMENT_RE.test(description)) continue;

		const amountSigned = parseBrazilianAmount(match[3]);
		const amount = Math.abs(amountSigned);
		if (amount <= 0) continue;

		transactions.push({
			externalId: makeSyntheticExternalId([date, description, String(amount)]),
			date,
			amount,
			description,
			transactionType: amountSigned < 0 ? "income" : "expense",
		});
	}

	if (transactions.length > 0) return transactions;

	const inlineTxnRe =
		/(\d{2}\/\d{2})\s+((?:(?!\d{2}\/\d{2}\s)[\s\S])+?)\s+(-?[\d.]+,\d{2})/g;

	for (const match of section.matchAll(inlineTxnRe)) {
		const date = parseItauSlashDate(match[1], dueDate);
		if (!date) continue;

		const description = match[2]
			.replace(/\s+\d{2}\/\d{2}$/, "")
			.replace(/\s+/g, " ")
			.trim();
		if (
			!description ||
			ITAU_PAYMENT_RE.test(description) ||
			/^total\b/i.test(description)
		) {
			continue;
		}

		const amountSigned = parseBrazilianAmount(match[3]);
		const amount = Math.abs(amountSigned);
		if (amount <= 0) continue;

		transactions.push({
			externalId: makeSyntheticExternalId([date, description, String(amount)]),
			date,
			amount,
			description,
			transactionType: amountSigned < 0 ? "income" : "expense",
		});
	}

	return transactions;
}

function extractItauPurchaseSections(text: string): string[] {
	const normalized = text.replace(/\u00a0/g, " ");
	const sectionStarts = [
		...normalized.matchAll(
			/lan[cç]amentos:\s*(?:compras e saques|produtos e servi[cç]os)/gi,
		),
	];

	if (sectionStarts.length === 0) {
		return [normalized];
	}

	return sectionStarts.map((match, index) => {
		const start = match.index ?? 0;
		const rest = normalized.slice(start);
		const endMatch = rest.search(ITAU_SECTION_END_RE);
		const sliceEnd = endMatch > 0 ? endMatch : Math.min(rest.length, 12000);
		return rest.slice(0, sliceEnd);
	});
}

function parseItauCardInvoiceMetadata(
	text: string,
	transactions: ImportedTransaction[],
): InvoiceImportMetadata | null {
	const dueDateMatch = text.match(/vencimento[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
	const dueDate = dueDateMatch ? parseSlashDateDMY(dueDateMatch[1]) : null;

	const totalMatch = text.match(/total desta fatura[^R]*R\$\s*([\d.]+,\d{2})/i);
	const parsedTotal = totalMatch ? parseBrazilianAmount(totalMatch[1]) : null;
	const transactionTotal = transactions.reduce(
		(total, transaction) => total + transaction.amount,
		0,
	);

	const paymentMatch = text.match(
		/pagamento\s+efetuado[^0-9]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
	);
	const paymentDate = paymentMatch ? parseSlashDateDMY(paymentMatch[1]) : null;

	const isPaid =
		Boolean(paymentDate) ||
		/pagamento\s+efetuado|pagamento\s+recebido/i.test(text);

	return buildInvoiceMetadataFromDueDate(dueDate, {
		isPaid,
		paymentDate,
		totalAmount:
			parsedTotal ?? (transactionTotal > 0 ? transactionTotal : null),
	});
}

function parseItauCardPdf(text: string): ImportStatement {
	if (!isItauCardInvoice(text)) {
		throw new Error("Fatura de cartão Itaú não reconhecida.");
	}

	const cardMatch =
		text.match(/cart[aã]o\s+final\s+(\d{4})/i) ??
		text.match(/final\s+(\d{4})/i);
	const accountNumber = cardMatch ? `****${cardMatch[1]}` : null;

	const dueDateMatch = text.match(/vencimento[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
	const dueDate = dueDateMatch ? parseSlashDateDMY(dueDateMatch[1]) : null;

	const transactions = extractItauPurchaseSections(text).flatMap((section) =>
		parseItauCardSection(section, dueDate),
	);

	const unique = new Map<string, ImportedTransaction>();
	for (const transaction of transactions) {
		unique.set(transaction.externalId ?? "", transaction);
	}
	const deduped = [...unique.values()];

	if (deduped.length === 0) {
		throw new Error("Nenhuma transação encontrada na fatura Itaú.");
	}

	return {
		source: "Itaú",
		accountNumber,
		period: buildPeriodFromTransactions(deduped),
		isCreditCard: true,
		transactions: deduped,
		invoice: parseItauCardInvoiceMetadata(text, deduped),
	};
}

function isInterCardInvoice(text: string): boolean {
	return (
		/Despesas da fatura|Resumo da fatura/i.test(text) &&
		/CARTÃO\s+\d{4}\*{4}\d{4}/i.test(text)
	);
}

const INTER_CARD_PAYMENT_RE =
	/P\s*AGTO\s*DEBITO|PAGAMENTO\s+(?:EM\s+)?DEBITO|DEBITO\s+AUTOMATICO/i;

function isInterCardPaymentForCurrentInvoice(
	paymentDate: string,
	dueDate: string,
): boolean {
	const payment = new Date(`${paymentDate}T12:00:00`);
	const due = new Date(`${dueDate}T12:00:00`);

	if (Number.isNaN(payment.getTime()) || Number.isNaN(due.getTime())) {
		return false;
	}

	// Na fatura Inter, a linha "P AGTO DEBITO AUTOMATICO" costuma registrar o
	// pagamento da fatura anterior (data no mês anterior ao vencimento atual).
	// Só tratamos como pagamento desta fatura quando a data é do mesmo mês do
	// vencimento ou posterior a ele.
	return (
		payment >= due ||
		(payment.getFullYear() === due.getFullYear() &&
			payment.getMonth() === due.getMonth())
	);
}

function buildInvoiceMetadataFromDueDate(
	dueDate: string | null,
	options: {
		isPaid?: boolean;
		paymentDate?: string | null;
		totalAmount?: number | null;
	},
): InvoiceImportMetadata | null {
	if (!dueDate) return null;

	return {
		period: derivePeriodFromDate(dueDate),
		dueDate,
		isPaid: options.isPaid ?? false,
		paymentDate: options.paymentDate ?? null,
		totalAmount: options.totalAmount ?? null,
	};
}

function parseInterCardInvoiceMetadata(
	text: string,
	transactions: ImportedTransaction[],
): InvoiceImportMetadata | null {
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
	const paymentAmount = paymentMatch
		? parseBrazilianAmount(paymentMatch[4])
		: null;

	const totalMatch = text.match(
		/Total(?:\s+da\s+fatura)?\s+[^R]*R\$\s*([\d.]+,\d{2})/i,
	);
	const parsedTotal = totalMatch ? parseBrazilianAmount(totalMatch[1]) : null;
	const transactionTotal = transactions.reduce(
		(total, transaction) => total + transaction.amount,
		0,
	);

	const isPaid =
		isCurrentInvoicePayment ||
		/fatura\s+paga|pagamento\s+efetuado|pago em/i.test(text);

	return buildInvoiceMetadataFromDueDate(dueDate, {
		isPaid,
		paymentDate,
		totalAmount:
			parsedTotal ?? (transactionTotal > 0 ? transactionTotal : null),
	});
}

function parseNubankInvoiceMetadata(
	text: string,
	transactions: ImportedTransaction[],
): InvoiceImportMetadata | null {
	const dueMatch = text.match(/Vencimento\s+(\d{2})\s+([A-Z]{3})\s+(\d{4})/i);
	const dueDate = dueMatch
		? parsePortugueseShortDate(
				dueMatch[1],
				dueMatch[2],
				Number.parseInt(dueMatch[3], 10),
			)
		: null;

	const totalMatch = text.match(/Total a pagar\s+R\$\s*([\d.]+,\d{2})/i);
	const parsedTotal = totalMatch ? parseBrazilianAmount(totalMatch[1]) : null;
	const transactionTotal = transactions.reduce(
		(total, transaction) => total + transaction.amount,
		0,
	);

	const paymentSection = text.slice(
		text.search(/Pagamentos e Financiamentos/i),
	);
	const paymentMatch = paymentSection.match(
		/(\d{2}\s+[A-Z]{3})\s+.+?\s+R\$\s*([\d.]+,\d{2})/,
	);
	const paymentDate =
		dueDate && paymentMatch
			? parsePortugueseShortDate(
					paymentMatch[1].split(/\s+/)[0],
					paymentMatch[1].split(/\s+/)[1],
					Number.parseInt(dueDate.slice(0, 4), 10),
				)
			: null;

	const isPaid =
		Boolean(paymentMatch) ||
		/Total a pagar\s+R\$\s*0,00/i.test(text) ||
		/Pagamento recebido/i.test(text);

	return buildInvoiceMetadataFromDueDate(dueDate, {
		isPaid,
		paymentDate,
		totalAmount:
			parsedTotal ?? (transactionTotal > 0 ? transactionTotal : null),
	});
}

function parseInterCardPdf(text: string): ImportStatement {
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

function parseNubankPdf(text: string): ImportStatement {
	if (!/Nu Pagamentos|Nubank/i.test(text) || !/TRANSAÇÕES/i.test(text)) {
		throw new Error("Fatura Nubank não reconhecida.");
	}

	const yearMatch = text.match(/FATURA\s+\d{2}\s+[A-Z]{3}\s+(\d{4})/i);
	const invoiceYear = yearMatch
		? Number.parseInt(yearMatch[1], 10)
		: new Date().getFullYear();

	const periodMatch = text.match(
		/TRANSAÇÕES\s+DE\s+(\d{2}\s+[A-Z]{3})\s+A\s+(\d{2}\s+[A-Z]{3})/i,
	);
	let period: { from: string; to: string } | null = null;
	if (periodMatch) {
		const [fromDay, fromMonth] = periodMatch[1].split(/\s+/);
		const [toDay, toMonth] = periodMatch[2].split(/\s+/);
		const from = parsePortugueseShortDate(fromDay, fromMonth, invoiceYear);
		const to = parsePortugueseShortDate(toDay, toMonth, invoiceYear);
		if (from && to) period = { from, to };
	}

	const transactionsStart = text.search(/TRANSAÇÕES\s+DE/i);
	const paymentsStart = text.search(/Pagamentos e Financiamentos/i);
	const transactionsSection =
		paymentsStart > transactionsStart
			? text.slice(transactionsStart, paymentsStart)
			: text.slice(transactionsStart);

	const txnRe =
		/(\d{2}\s+[A-Z]{3})\s+(?:••••\s+\d{4}\s+)?(.+?)\s+R\$\s*([\d.]+,\d{2})/g;

	const transactions: ImportedTransaction[] = [];

	for (const match of transactionsSection.matchAll(txnRe)) {
		const [day, monthAbbr] = match[1].split(/\s+/);
		const date = parsePortugueseShortDate(day, monthAbbr, invoiceYear);
		if (!date) continue;

		const description = match[2].trim();
		if (
			!description ||
			/Franklin/i.test(description) ||
			/TRANSAÇÕES/i.test(description)
		) {
			continue;
		}

		const amount = parseBrazilianAmount(match[3]);
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
		throw new Error("Nenhuma transação encontrada na fatura Nubank.");
	}

	return {
		source: "Nubank",
		accountNumber: null,
		period: period ?? buildPeriodFromTransactions(transactions),
		isCreditCard: true,
		transactions,
		invoice: parseNubankInvoiceMetadata(text, transactions),
	};
}

export async function parsePdf(
	buffer: ArrayBuffer,
	password?: string,
	extraCandidates: string[] = [],
): Promise<ImportStatement> {
	const text = await extractPdfText(buffer, password, extraCandidates);
	return parsePdfText(text);
}

export function parsePdfText(text: string): ImportStatement {
	if (isItauCardInvoice(text)) {
		return parseItauCardPdf(text);
	}

	if (/Nu Pagamentos|Nubank/i.test(text) && /TRANSAÇÕES/i.test(text)) {
		return parseNubankPdf(text);
	}

	if (isInterCardInvoice(text)) {
		return parseInterCardPdf(text);
	}

	if (/Período:|Saldo por transação/i.test(text)) {
		return parseInterBankPdf(text);
	}

	throw new Error(
		"PDF não reconhecido. Suportamos extratos e faturas do Banco Inter, faturas do Nubank e faturas de cartão Itaú.",
	);
}
