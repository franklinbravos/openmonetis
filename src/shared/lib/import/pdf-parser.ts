import { derivePeriodFromDate } from "@/shared/utils/period";
import {
	buildPeriodFromTransactions,
	getPortugueseMonthNumberFromAbbr,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parsePortugueseAbbrevDotDate,
	parsePortugueseLongDate,
	parsePortugueseShortDate,
	parseSlashDateDMY,
} from "./helpers";
import { resolveNubankInvoicePeriod } from "./nubank-invoice-period";
import { openPdfDocumentWithPassword } from "./pdf-password";
import type {
	ImportedTransaction,
	ImportStatement,
	InvoiceImportMetadata,
	InvoiceSourceTotalKind,
} from "./types";

async function openPdfDocument(
	buffer: ArrayBuffer,
	password?: string,
	extraCandidates: string[] = [],
) {
	return openPdfDocumentWithPassword(buffer, password, extraCandidates);
}

export async function extractPdfText(
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

	const isPaid = Boolean(paymentDate) || /pagamento\s+efetuado/i.test(text);

	return buildInvoiceMetadataFromDueDate(dueDate, {
		isPaid,
		paymentDate,
		...resolvePdfTotalMetadata(parsedTotal, transactionTotal),
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
		totalAmountSource?: InvoiceSourceTotalKind | null;
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
	};
}

function resolvePdfTotalMetadata(
	parsedTotal: number | null,
	transactionTotal: number,
): Pick<InvoiceImportMetadata, "totalAmount" | "totalAmountSource"> {
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
		...resolvePdfTotalMetadata(parsedTotal, transactionTotal),
	});
}

/** Fatura Nubank: usa o ano do cabeçalho FATURA (antes do ciclo de compras). */
function parseNubankFaturaHeader(text: string): { invoiceYear: number } | null {
	const cycleIdx = findNubankBillingCycleIndex(text);
	const faturaRe = /FATURA\s+(\d{2})\s+([A-Z]{3})\s+(\d{4})/gi;
	const allMatches = [...text.matchAll(faturaRe)];
	const headerMatches =
		cycleIdx >= 0
			? allMatches.filter(
					(match) => match.index !== undefined && match.index < cycleIdx,
				)
			: allMatches;

	const match = headerMatches.at(-1) ?? allMatches.at(0);
	if (!match) return null;

	const year = Number.parseInt(match[3], 10);
	if (Number.isNaN(year)) return null;

	return { invoiceYear: year };
}

function findNubankBillingCycleIndex(text: string): number {
	const markers = [
		text.search(/Per[ií]odo vigente/i),
		text.search(/TRANSAÇÕES/i),
	].filter((index) => index >= 0);

	if (markers.length === 0) return -1;
	return Math.min(...markers);
}

const NUBANK_BILLING_WINDOW_RE =
	/(?:Per[ií]odo vigente:\s*|TRANSAÇÕES\s+DE\s+)(\d{2}\s+[A-Z]{3})\s+a\s+(\d{2}\s+[A-Z]{3})/i;

function parseNubankDueDate(text: string): string | null {
	const patterns = [
		/Data de vencimento:\s*(\d{2})\s+([A-Z]{3})\s+(\d{4})/i,
		/Vencimento\s+(\d{2})\s+([A-Z]{3})\s+(\d{4})/i,
	];

	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (!match) continue;

		const parsed = parsePortugueseShortDate(
			match[1],
			match[2],
			Number.parseInt(match[3], 10),
		);
		if (parsed) return parsed;
	}

	return null;
}

function parseNubankBillingWindow(
	text: string,
	invoiceYear: number,
): {
	from: string;
	to: string;
	fromYear: number;
	toYear: number;
	fromMonth: number;
	toMonth: number;
} | null {
	const periodMatch = text.match(NUBANK_BILLING_WINDOW_RE);
	if (!periodMatch) return null;

	const [fromDay, fromMonthAbbr] = periodMatch[1].split(/\s+/);
	const [toDay, toMonthAbbr] = periodMatch[2].split(/\s+/);
	const fromMonth = getPortugueseMonthNumberFromAbbr(fromMonthAbbr);
	const toMonth = getPortugueseMonthNumberFromAbbr(toMonthAbbr);
	if (!fromMonth || !toMonth) return null;

	let fromYear = invoiceYear;
	const toYear = invoiceYear;
	if (fromMonth > toMonth) {
		fromYear = invoiceYear - 1;
	}

	const from = parsePortugueseShortDate(fromDay, fromMonthAbbr, fromYear);
	const to = parsePortugueseShortDate(toDay, toMonthAbbr, toYear);
	if (!from || !to) return null;

	return { from, to, fromYear, toYear, fromMonth, toMonth };
}

function resolveNubankTransactionYear(
	monthAbbr: string,
	billingWindow: ReturnType<typeof parseNubankBillingWindow>,
	fallbackYear: number,
): number {
	if (!billingWindow) return fallbackYear;

	const month = getPortugueseMonthNumberFromAbbr(monthAbbr);
	if (!month) return fallbackYear;
	if (month === billingWindow.fromMonth) return billingWindow.fromYear;
	if (month === billingWindow.toMonth) return billingWindow.toYear;

	return month > billingWindow.toMonth
		? billingWindow.fromYear
		: billingWindow.toYear;
}

/**
 * Data do pagamento, resolvendo o ano.
 *
 * O PDF traz só dia e mês. O pagamento antecede o vencimento, então quando o
 * ano do vencimento colocaria a data depois dele, o ano certo é o anterior —
 * caso da fatura de janeiro paga em dezembro.
 */
function resolvePaymentDateBeforeDueDate(
	day: string,
	monthAbbr: string,
	dueDate: string,
): string | null {
	const dueYear = Number.parseInt(dueDate.slice(0, 4), 10);
	const sameYear = parsePortugueseShortDate(day, monthAbbr, dueYear);
	if (!sameYear) return null;
	if (sameYear <= dueDate) return sameYear;

	return parsePortugueseShortDate(day, monthAbbr, dueYear - 1);
}

/**
 * Limites do bloco "Limites disponíveis".
 *
 * O bloco traz duas colunas — utilizado e disponível — por linha:
 *
 *   Limite total                         R$ 11.398,09   R$ 14.576,95
 *   Pré-aprovado                          R$ 2.799,99    R$ 2.800,00
 *   Nu Limite Garantido e limite extra    R$ 8.598,10   R$ 11.776,95
 *
 * O limite de cada linha é a soma das duas colunas; as sub-linhas somam o total.
 */
function parseNubankCreditLimits(text: string): {
	total: number | null;
	guaranteed: number | null;
} {
	const readLine = (label: RegExp): number | null => {
		const match = text.match(
			new RegExp(
				`${label.source}\\s+R\\$\\s*([\\d.]+,\\d{2})\\s+R\\$\\s*([\\d.]+,\\d{2})`,
				"i",
			),
		);
		if (!match) return null;

		return roundToCents(
			parseBrazilianAmount(match[1]) + parseBrazilianAmount(match[2]),
		);
	};

	return {
		total: readLine(/Limite total/),
		guaranteed: readLine(/Nu Limite Garantido(?:\s+e\s+limite\s+extra)?/),
	};
}

function roundToCents(value: number): number {
	return Math.round(value * 100) / 100;
}

function parseNubankInvoiceMetadata(
	text: string,
	transactions: ImportedTransaction[],
	billingWindow: ReturnType<typeof parseNubankBillingWindow>,
): InvoiceImportMetadata | null {
	const dueDate = parseNubankDueDate(text);

	const totalMatch = text.match(/Total a pagar\s+R\$\s*([\d.]+,\d{2})/i);

	// Bloco "Resumo da fatura atual": o banco declara a fatura anterior e quanto
	// dela recebeu. Com os dois, o pagamento parcial é conferido sem inferência.
	// O sinal do pagamento vem como menos ASCII ou Unicode.
	const previousInvoiceMatch = text.match(
		/Fatura anterior\s+R\$\s*([\d.]+,\d{2})/i,
	);
	const previousPaymentMatch = text.match(
		/Pagamento recebido\s+[-−–]?\s*R\$\s*([\d.]+,\d{2})/i,
	);
	const creditLimits = parseNubankCreditLimits(text);
	const parsedTotal = totalMatch ? parseBrazilianAmount(totalMatch[1]) : null;
	const transactionTotal = transactions.reduce(
		(total, transaction) => total + transaction.amount,
		0,
	);

	/**
	 * Linha do pagamento: "13 ABR Pagamento em 13 ABR −R$ 10.430,51".
	 *
	 * Casar a linha inteira, em vez de fatiar por título de seção: o título varia
	 * ("Pagamentos", "Pagamentos e Financiamentos"), a palavra aparece antes no
	 * documento, e `slice(-1)` de um índice não encontrado cortava o texto no
	 * último caractere. O resultado era a data do vencimento no lugar da data do
	 * pagamento.
	 *
	 * O menos é obrigatório: pagamento é crédito, e exigi-lo evita casar com
	 * linha de compra que mencione a palavra.
	 */
	const paymentMatch = text.match(
		/(\d{2})\s+([A-Z]{3})\s+Pagamento[^\n]*?[-−–]\s*R\$\s*[\d.]+,\d{2}/i,
	);
	const paymentDate =
		dueDate && paymentMatch
			? resolvePaymentDateBeforeDueDate(
					paymentMatch[1],
					paymentMatch[2],
					dueDate,
				)
			: null;

	const isPaid = /Total a pagar\s+R\$\s*0,00/i.test(text);

	const period = resolveNubankInvoicePeriod({
		billingWindowEndDate: billingWindow?.to ?? null,
		dueDate,
	});

	if (!dueDate && !period) return null;

	const totalMetadata = resolvePdfTotalMetadata(parsedTotal, transactionTotal);

	return {
		period,
		previousInvoiceTotal: previousInvoiceMatch
			? parseBrazilianAmount(previousInvoiceMatch[1])
			: null,
		previousInvoicePaymentReceived: previousPaymentMatch
			? parseBrazilianAmount(previousPaymentMatch[1])
			: null,
		creditLimitTotal: creditLimits.total,
		creditLimitGuaranteed: creditLimits.guaranteed,
		dueDate,
		isPaid,
		paymentDate,
		totalAmount: totalMetadata.totalAmount,
		totalAmountSource: totalMetadata.totalAmountSource,
	};
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

function isNubankCardInvoicePdf(text: string): boolean {
	return (
		/Nu Pagamentos|Nubank/i.test(text) &&
		(/TRANSAÇÕES/i.test(text) || /Per[ií]odo vigente/i.test(text))
	);
}

function findNubankTransactionsSectionStart(text: string): number {
	const transactionsDeIdx = text.search(/TRANSAÇÕES\s+DE/i);
	if (transactionsDeIdx >= 0) return transactionsDeIdx;

	const vigenteMatch = text.match(/Per[ií]odo vigente:[^\n]*/i);
	if (vigenteMatch?.index !== undefined) {
		const lineEnd = text.indexOf("\n", vigenteMatch.index);
		return lineEnd >= 0 ? lineEnd + 1 : vigenteMatch.index;
	}

	return text.search(/TRANSAÇÕES/i);
}

/**
 * Cada página de continuação repete cabeçalho e rodapé no meio da lista de
 * transações. Como "FATURA 12 JAN 2026" tem a mesma cara de uma data de
 * lançamento, a regex de transação ancorava nele e engolia a primeira compra da
 * página junto com o ruído — a linha sumia da importação sem aviso.
 */
function stripNubankPageBreakNoise(section: string): string {
	return section
		.replace(
			/TRANSA[ÇC][ÕO]ES\s+DE\s+\d{2}\s+[A-Z]{3}\s+A\s+\d{2}\s+[A-Z]{3}/gi,
			"\n",
		)
		.replace(/EMISS[ÃA]O\s+E\s+ENVIO\s+\d{2}\s+[A-Z]{3}\s+\d{4}/gi, "\n")
		.replace(/FATURA\s+\d{2}\s+[A-Z]{3}\s+\d{4}/gi, "\n")
		.replace(/Per[ií]odo vigente:\s*[^\n]*/gi, "\n");
}

function parseNubankPdf(text: string): ImportStatement {
	if (!isNubankCardInvoicePdf(text)) {
		throw new Error("Fatura Nubank não reconhecida.");
	}

	const dueDate = parseNubankDueDate(text);
	const faturaHeader = parseNubankFaturaHeader(text);
	const invoiceYear =
		faturaHeader?.invoiceYear ??
		(dueDate
			? Number.parseInt(dueDate.slice(0, 4), 10)
			: new Date().getFullYear());
	const billingWindow = parseNubankBillingWindow(text, invoiceYear);
	const period = billingWindow
		? { from: billingWindow.from, to: billingWindow.to }
		: null;

	const transactionsStart = findNubankTransactionsSectionStart(text);
	const paymentsStart = text.search(/Pagamentos e Financiamentos/i);
	let transactionsSection =
		paymentsStart > transactionsStart
			? text.slice(transactionsStart, paymentsStart)
			: text.slice(transactionsStart);

	transactionsSection = stripNubankPageBreakNoise(transactionsSection);

	const txnRe =
		/(\d{2}\s+[A-Z]{3})\s+(?:••••\s+\d{4}\s+)?(.+?)\s+R\$\s*([\d.]+,\d{2})/g;

	const transactions: ImportedTransaction[] = [];

	for (const match of transactionsSection.matchAll(txnRe)) {
		const [day, monthAbbr] = match[1].split(/\s+/);
		const transactionYear = resolveNubankTransactionYear(
			monthAbbr,
			billingWindow,
			invoiceYear,
		);
		const date = parsePortugueseShortDate(day, monthAbbr, transactionYear);
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
		invoice: parseNubankInvoiceMetadata(text, transactions, billingWindow),
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

	if (isNubankCardInvoicePdf(text)) {
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
