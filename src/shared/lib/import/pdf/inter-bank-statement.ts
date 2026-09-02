import type { AccountStatementBalances } from "@/shared/lib/import/account-statement-balances";
import {
	buildPeriodFromTransactions,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parseBrazilianAmountOrNull,
	parsePortugueseLongDate,
	parseSlashDateDMY,
} from "@/shared/lib/import/helpers";
import {
	roundMoney,
	SOURCE_ROUNDING_TOLERANCE,
} from "@/shared/lib/import/invoice-total";
import type {
	ImportedTransaction,
	ImportStatement,
} from "@/shared/lib/import/types";

const AMOUNT = String.raw`-?R\$\s*[\d.]+,\d{2}`;

/** Rodapé que se repete no meio das movimentações — não pode truncar o extrato. */
const INTER_PAGE_NOISE_PATTERNS = [
	/Fale com a gente[\s\S]*?0800 979 7099/gi,
	/-- \d+ of \d+ --/g,
];

export type InterBankStatementMovement = ImportedTransaction & {
	runningBalance: number;
	signedAmount: number;
};

export type InterBankStatementParseResult = {
	transactions: InterBankStatementMovement[];
};

export function isInterBankStatementPdf(text: string): boolean {
	return (
		!/Resumo da fatura|DESPESAS DO M[ÊE]S/i.test(text) &&
		(/Saldo por transação/i.test(text) || /Saldo do dia:/i.test(text))
	);
}

function stripPageNoise(text: string): string {
	return INTER_PAGE_NOISE_PATTERNS.reduce(
		(current, pattern) => current.replace(pattern, " "),
		text,
	);
}

function parseStatementPeriod(
	text: string,
): { from: string; to: string } | null {
	const periodMatch = text.match(
		/Período:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
	);
	if (!periodMatch?.[1] || !periodMatch[2]) return null;

	const from = parseSlashDateDMY(periodMatch[1]);
	const to = parseSlashDateDMY(periodMatch[2]);
	return from && to ? { from, to } : null;
}

function parseHeaderAvailableBalance(text: string): number | null {
	const match = text.match(/Saldo disponível:\s*(-?R\$\s*[\d.]+,\d{2})/i);
	return match?.[1] ? parseBrazilianAmountOrNull(match[1]) : null;
}

export function parseInterBankStatementMovements(
	text: string,
): InterBankStatementParseResult {
	const cleaned = stripPageNoise(text);
	const transactionsStart = cleaned.search(/Saldo por transação/i);
	const section =
		transactionsStart >= 0 ? cleaned.slice(transactionsStart) : cleaned;

	const transactions: InterBankStatementMovement[] = [];

	const dayHeaderRe = new RegExp(
		String.raw`(\d{1,2}) de ([A-Za-zçãéôÇÃÉÔ]+) de (\d{4})\s+Saldo do dia:\s*${AMOUNT}`,
		"gi",
	);
	const txnRe = new RegExp(String.raw`(.+?)\s+(${AMOUNT})\s+(${AMOUNT})`, "g");

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

			const signedAmount = parseBrazilianAmount(txnMatch[2]);
			const runningBalance = parseBrazilianAmount(txnMatch[3]);
			if (signedAmount === 0) continue;

			transactions.push({
				externalId: makeSyntheticExternalId([
					date,
					String(Math.abs(signedAmount)),
					description,
				]),
				date,
				amount: Math.abs(signedAmount),
				description,
				transactionType: signedAmount > 0 ? "income" : "expense",
				runningBalance,
				signedAmount,
			});
		}
	}

	return { transactions };
}

export function parseInterBankStatementBalances(
	text: string,
	movements: InterBankStatementMovement[],
	period: { from: string; to: string },
): AccountStatementBalances | null {
	if (movements.length === 0) return null;

	const first = movements[0];
	const last = movements.at(-1);
	if (!first || !last) return null;

	const openingBalance = roundMoney(first.runningBalance - first.signedAmount);
	const closingBalance = roundMoney(last.runningBalance);
	const headerBalance = parseHeaderAvailableBalance(text);

	const netFromMovements = roundMoney(
		movements.reduce((total, movement) => total + movement.signedAmount, 0),
	);
	const residual = roundMoney(
		openingBalance + netFromMovements - closingBalance,
	);

	const headerMatches =
		headerBalance == null ||
		Math.abs(headerBalance - closingBalance) <= SOURCE_ROUNDING_TOLERANCE;

	return {
		openingBalance,
		closingBalance,
		yield: 0,
		periodFrom: period.from,
		periodTo: period.to,
		balances: Math.abs(residual) <= SOURCE_ROUNDING_TOLERANCE && headerMatches,
	};
}

export function parseInterBankStatementPdf(text: string): ImportStatement {
	if (!isInterBankStatementPdf(text)) {
		throw new Error("PDF de extrato do Banco Inter não reconhecido.");
	}

	const accountMatch = text.match(/Conta:\s*([\d-]+)/i);
	const accountNumber = accountMatch?.[1]?.replace(/\D/g, "") ?? null;
	const period = parseStatementPeriod(text);
	const { transactions } = parseInterBankStatementMovements(text);

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada no PDF.");
	}

	const resolvedPeriod =
		period?.from && period.to
			? { from: period.from, to: period.to }
			: buildPeriodFromTransactions(transactions);

	if (!resolvedPeriod) {
		throw new Error("Nenhuma transação encontrada no PDF.");
	}

	const accountBalances = parseInterBankStatementBalances(
		text,
		transactions,
		resolvedPeriod,
	);

	return {
		source: "Banco Inter",
		accountNumber,
		period: resolvedPeriod,
		isCreditCard: false,
		accountBalances,
		transactions: transactions.map(
			({
				runningBalance: _runningBalance,
				signedAmount: _signedAmount,
				...transaction
			}) => transaction,
		),
	};
}
