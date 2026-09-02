import type { AccountStatementBalances } from "@/shared/lib/import/account-statement-balances";
import {
	buildPeriodFromTransactions,
	normalizeImportedText,
	parseBrazilianAmountOrNull,
	parseDashDateDMY,
} from "@/shared/lib/import/helpers";
import {
	roundMoney,
	SOURCE_ROUNDING_TOLERANCE,
} from "@/shared/lib/import/invoice-total";
import type {
	ImportedTransaction,
	ImportStatement,
} from "@/shared/lib/import/types";

/**
 * Extrato de conta do Mercado Pago em PDF.
 *
 * Cada linha traz data, descrição, ID da operação, valor com sinal e saldo
 * corrido. O cabeçalho declara abertura, entradas, saídas e fechamento — e o
 * saldo corrido fecha linha a linha quando o ruído de página é removido antes
 * de tokenizar.
 *
 * Os IDs numéricos são ids de banco reais (não sintéticos). A busca de
 * duplicata é escopada por usuário, não por conta — colisão com FITIDs de
 * outros bancos é rara na prática, mas ver `import-action.ts` se incomodar.
 */

const AMOUNT = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;

const PAGE_NOISE_PATTERNS = [
	/Data de geração:\s*\d{2}-\d{2}-\d{4}/gi,
	/Você tem alguma dúvida\?[\s\S]*?mercadopago\.com\.br\s*\d{1,2}\/\d{1,2}/gi,
	/(^|\n)\s*\d{1,2}\/\d{1,2}\s+/g,
	/DETALHE DOS MOVIMENTOS\s+Data\s+Descri[çc][ãa]o\s+ID da opera[çc][ãa]o\s+Valor\s+Saldo/gi,
	/Data\s+Descri[çc][ãa]o\s+ID da opera[çc][ãa]o\s+Valor\s+Saldo/gi,
	/Saldo final:\s*R\$\s*[\d.-]+(?:\.\d{3})*,\d{2}/gi,
];

export function isMercadoPagoBankStatementPdf(text: string): boolean {
	return (
		/DETALHE DOS MOVIMENTOS/i.test(text) && /ID da opera[çc][ãa]o/i.test(text)
	);
}

export type MercadoPagoStatementMovement = ImportedTransaction & {
	runningBalance: number;
	signedAmount: number;
	operationId: string;
};

export type MercadoPagoStatementChainCheck = {
	index: number;
	date: string;
	description: string;
	previousBalance: number;
	signedAmount: number;
	expectedBalance: number;
	declaredBalance: number;
	balances: boolean;
};

export type MercadoPagoStatementParseResult = {
	transactions: MercadoPagoStatementMovement[];
	chain: MercadoPagoStatementChainCheck[];
	/** Descartadas: data fora do período declarado. */
	outOfPeriodCount: number;
	/** Descartadas: valor zero. */
	zeroAmountCount: number;
};

export type MercadoPagoStatementHeader = {
	holder: { name: string | null; document: string | null } | null;
	agency: string | null;
	accountNumber: string | null;
	period: { from: string; to: string } | null;
	declaredOpeningBalance: number | null;
	declaredTotalIn: number | null;
	declaredTotalOut: number | null;
	declaredClosingBalance: number | null;
};

function stripPageNoise(text: string): string {
	return PAGE_NOISE_PATTERNS.reduce(
		(current, pattern) => current.replace(pattern, " "),
		text,
	);
}

function sliceMovementsSection(text: string): string {
	const marker = text.match(/DETALHE DOS MOVIMENTOS/i);
	if (!marker || marker.index == null) return "";
	return text.slice(marker.index + marker[0].length);
}

function resolveCategoryRaw(description: string): string | null {
	const normalized = normalizeImportedText(description);
	return /^rendimentos?$/i.test(normalized) ? "Rendimentos" : null;
}

export function parseMercadoPagoStatementHeader(
	text: string,
): MercadoPagoStatementHeader {
	const holderMatch = text.match(
		/EXTRATO DE CONTA\s+(.+?)\s+CPF\/CNPJ:\s*(\d{11,14})\s+(\d+)\s+(\d+)\s+Ag[êe]ncia:\s*Conta:/i,
	);

	const periodMatch = text.match(
		/De\s+(\d{2}-\d{2}-\d{4})\s+(?:al?|at[eé])\s+(\d{2}-\d{2}-\d{4})\s*Per[íi]odo:/i,
	);

	const balancesMatch = text.match(
		new RegExp(
			String.raw`Saldo inicial:\s*R\$\s*(${AMOUNT})\s+Entradas:\s*R\$\s*(${AMOUNT})\s+Sa[íi]das:\s*R\$\s*(${AMOUNT})`,
			"i",
		),
	);

	const closingMatch = text.match(
		new RegExp(String.raw`Saldo final:\s*R\$\s*(${AMOUNT})`, "i"),
	);

	const from = periodMatch?.[1] ? parseDashDateDMY(periodMatch[1]) : null;
	const to = periodMatch?.[2] ? parseDashDateDMY(periodMatch[2]) : null;

	const holderName = holderMatch?.[1]
		? normalizeImportedText(holderMatch[1])
		: null;
	const holderDocument = holderMatch?.[2]?.trim() ?? null;

	return {
		holder:
			holderName || holderDocument
				? { name: holderName || null, document: holderDocument }
				: null,
		agency: holderMatch?.[3] ?? null,
		accountNumber: holderMatch?.[4] ?? null,
		period: from && to ? { from, to } : null,
		declaredOpeningBalance: balancesMatch?.[1]
			? parseBrazilianAmountOrNull(balancesMatch[1])
			: null,
		declaredTotalIn: balancesMatch?.[2]
			? parseBrazilianAmountOrNull(balancesMatch[2])
			: null,
		declaredTotalOut: balancesMatch?.[3]
			? parseBrazilianAmountOrNull(balancesMatch[3])
			: null,
		declaredClosingBalance: closingMatch?.[1]
			? parseBrazilianAmountOrNull(closingMatch[1])
			: null,
	};
}

export function parseMercadoPagoStatementMovements(
	text: string,
	period?: { from: string; to: string } | null,
): MercadoPagoStatementParseResult {
	const section = sliceMovementsSection(text);
	if (!section) {
		return {
			transactions: [],
			chain: [],
			outOfPeriodCount: 0,
			zeroAmountCount: 0,
		};
	}

	const header = parseMercadoPagoStatementHeader(text);
	const cleaned = stripPageNoise(section);
	const lineRe = new RegExp(
		String.raw`(\d{2}-\d{2}-\d{4})\s+(.+?)\s+(\d{9,})\s+R\$\s*(${AMOUNT})\s+R\$\s*(${AMOUNT})`,
		"g",
	);

	const transactions: MercadoPagoStatementMovement[] = [];
	const chain: MercadoPagoStatementChainCheck[] = [];
	let outOfPeriodCount = 0;
	let zeroAmountCount = 0;
	let previousBalance = header.declaredOpeningBalance ?? 0;

	for (const match of cleaned.matchAll(lineRe)) {
		const rawDate = match[1] ?? "";
		const description = normalizeImportedText(match[2] ?? "");
		const operationId = match[3] ?? "";
		const signedAmount = parseBrazilianAmountOrNull(`R$ ${match[4] ?? ""}`);
		const declaredBalance = parseBrazilianAmountOrNull(`R$ ${match[5] ?? ""}`);

		if (signedAmount == null || declaredBalance == null || !description) {
			continue;
		}

		const date = parseDashDateDMY(rawDate);
		if (!date) continue;

		if (signedAmount === 0) {
			zeroAmountCount++;
			continue;
		}

		if (period && (date < period.from || date > period.to)) {
			outOfPeriodCount++;
			continue;
		}

		const expectedBalance = roundMoney(previousBalance + signedAmount);
		const balances =
			Math.abs(expectedBalance - declaredBalance) <= SOURCE_ROUNDING_TOLERANCE;

		chain.push({
			index: transactions.length,
			date,
			description,
			previousBalance: roundMoney(previousBalance),
			signedAmount,
			expectedBalance,
			declaredBalance,
			balances,
		});

		previousBalance = declaredBalance;

		transactions.push({
			externalId: operationId,
			date,
			amount: Math.abs(signedAmount),
			description,
			transactionType: signedAmount > 0 ? "income" : "expense",
			categoryRaw: resolveCategoryRaw(description),
			runningBalance: declaredBalance,
			signedAmount,
			operationId,
		});
	}

	return { transactions, chain, outOfPeriodCount, zeroAmountCount };
}

export function parseMercadoPagoStatementBalances(
	header: MercadoPagoStatementHeader,
	result: MercadoPagoStatementParseResult,
	period: { from: string; to: string },
): AccountStatementBalances | null {
	const {
		declaredOpeningBalance,
		declaredClosingBalance,
		declaredTotalIn,
		declaredTotalOut,
	} = header;

	if (
		declaredOpeningBalance == null ||
		declaredClosingBalance == null ||
		declaredTotalIn == null ||
		declaredTotalOut == null
	) {
		return null;
	}

	const totalOutAbs = Math.abs(declaredTotalOut);
	const componentsTotal = roundMoney(
		declaredOpeningBalance + declaredTotalIn - totalOutAbs,
	);
	const residual = roundMoney(componentsTotal - declaredClosingBalance);
	const headerBalances =
		Math.abs(residual) <= SOURCE_ROUNDING_TOLERANCE &&
		result.outOfPeriodCount === 0;
	const chainBalances =
		result.chain.length > 0 && result.chain.every((entry) => entry.balances);

	return {
		openingBalance: declaredOpeningBalance,
		closingBalance: declaredClosingBalance,
		yield: 0,
		totalIn: declaredTotalIn,
		totalOut: totalOutAbs,
		periodFrom: period.from,
		periodTo: period.to,
		balances: headerBalances && chainBalances,
	};
}

export function parseMercadoPagoBankStatementPdf(
	text: string,
): ImportStatement {
	if (!isMercadoPagoBankStatementPdf(text)) {
		throw new Error("PDF de extrato do Mercado Pago não reconhecido.");
	}

	const header = parseMercadoPagoStatementHeader(text);
	const { transactions, chain, outOfPeriodCount, zeroAmountCount } =
		parseMercadoPagoStatementMovements(text, header.period);

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada no extrato Mercado Pago.");
	}

	const resolvedPeriod =
		header.period ??
		buildPeriodFromTransactions(
			transactions.map(
				({
					runningBalance: _runningBalance,
					signedAmount: _signedAmount,
					operationId: _operationId,
					...transaction
				}) => transaction,
			),
		);

	if (!resolvedPeriod) {
		throw new Error("Nenhuma transação encontrada no extrato Mercado Pago.");
	}

	const accountBalances = parseMercadoPagoStatementBalances(
		header,
		{ transactions, chain, outOfPeriodCount, zeroAmountCount },
		resolvedPeriod,
	);

	return {
		source: "Mercado Pago",
		accountNumber: header.accountNumber,
		period: resolvedPeriod,
		isCreditCard: false,
		accountHolder: header.holder,
		accountBalances,
		transactions: transactions.map(
			({
				runningBalance: _runningBalance,
				signedAmount: _signedAmount,
				operationId: _operationId,
				...transaction
			}) => transaction,
		),
	};
}
