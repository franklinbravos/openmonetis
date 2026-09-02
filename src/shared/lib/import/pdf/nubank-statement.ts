import type { AccountStatementBalances } from "@/shared/lib/import/account-statement-balances";
import {
	makeSyntheticExternalId,
	normalizeImportedText,
	parseBrazilianAmountOrNull,
	parsePortugueseLongDate,
	parsePortugueseShortDate,
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
 * Extrato de conta do Nubank em PDF.
 *
 * O documento não traz sinal por lançamento: ele agrupa por dia e, dentro do
 * dia, por direção — "Total de entradas + X" e "Total de saídas − Y" —, e cada
 * grupo declara o próprio subtotal. Então o sinal de uma linha vem do grupo em
 * que ela está, e os subtotais dão de graça a conferência que o extrato em OFX
 * nunca teve.
 *
 * No topo há um segundo livro que também fecha:
 *
 *     saldo inicial + rendimento + entradas − saídas = saldo final
 */

const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;

/** Cabeçalho e rodapé que se repetem a cada página, no meio das movimentações. */
const PAGE_NOISE_PATTERNS = [
	/Tem alguma d[úu]vida\?[\s\S]*?Atendimento 24h\./gi,
	/Caso a solu[çc][ãa]o fornecida[\s\S]*?em dias [úu]teis\./gi,
	/Extrato gerado dia[\s\S]*?\d+ de \d+/gi,
	// Cabeçalho de página: nome do titular, CPF, agência e conta. Sem consumir o
	// nome e o número da conta, eles grudam na descrição do lançamento seguinte.
	/(^|\n)[^\n]{0,120}?•+\.\d{3}\.\d{3}-•+\s+\d{4}\s+CPF\s+Ag[êe]ncia\s+Conta\s+[\d-]+/g,
	/a \d{2} DE [A-ZÇ]+ DE \d{4}\s+\d{2} DE [A-ZÇ]+ DE \d{4}\s+VALORES EM R\$/gi,
];

export type NubankStatementBalances = {
	openingBalance: number | null;
	yield: number;
	totalIn: number | null;
	totalOut: number | null;
	closingBalance: number | null;
	/** Soma dos componentes menos o saldo final declarado. */
	residual: number;
	balances: boolean;
};

export function isNubankBankStatementPdf(text: string): boolean {
	return (
		/Nu\s*Pagamentos|Nubank/i.test(text) &&
		/Movimenta[çc][õo]es/i.test(text) &&
		/Saldo\s+inicial/i.test(text) &&
		/Total\s+de\s+(entradas|sa[íi]das)/i.test(text)
	);
}

function stripPageNoise(text: string): string {
	return PAGE_NOISE_PATTERNS.reduce(
		(current, pattern) => current.replace(pattern, " "),
		text,
	);
}

/**
 * O bloco de saldos do topo, que o extrato declara e fecha sozinho.
 *
 * Os rótulos vêm todos juntos e só depois os valores, na mesma ordem — é assim
 * que o PDF diagrama a tabela —, então o casamento é posicional.
 */
export function parseNubankStatementBalances(
	text: string,
): NubankStatementBalances | null {
	const block = text.match(
		new RegExp(
			String.raw`Saldo inicial\s+Rendimento l[íi]quido\s+Total de entradas\s+Total de sa[íi]das\s+Saldo final do per[íi]odo\s+` +
				String.raw`([+-]?\s*${AMOUNT})\s+([+-]?\s*${AMOUNT})\s+([+-]?\s*${AMOUNT})\s+([+-]?\s*${AMOUNT})\s+([+-]?\s*${AMOUNT})`,
			"i",
		),
	);

	if (!block) return null;

	const [openingBalance, yieldAmount, totalIn, totalOut, closingBalance] = [
		block[1],
		block[2],
		block[3],
		block[4],
		block[5],
	].map((raw) => parseBrazilianAmountOrNull(raw ?? ""));

	if (closingBalance == null) return null;

	const componentsTotal = roundMoney(
		(openingBalance ?? 0) +
			(yieldAmount ?? 0) +
			Math.abs(totalIn ?? 0) -
			Math.abs(totalOut ?? 0),
	);
	const residual = roundMoney(componentsTotal - closingBalance);

	return {
		openingBalance,
		yield: yieldAmount ?? 0,
		totalIn: totalIn == null ? null : Math.abs(totalIn),
		totalOut: totalOut == null ? null : Math.abs(totalOut),
		closingBalance,
		residual,
		balances: Math.abs(residual) <= SOURCE_ROUNDING_TOLERANCE,
	};
}

type Token =
	| { kind: "date"; end: number; date: string }
	| { kind: "group"; end: number; direction: "in" | "out"; declared: number }
	| { kind: "amount"; start: number; end: number; amount: number };

/**
 * Percorre as movimentações em ordem, marcando data, direção e valores.
 *
 * A descrição de um lançamento é tudo que existe entre o marcador anterior e o
 * seu valor — o PDF não delimita a linha de outra forma, e a descrição carrega
 * CNPJ, agência e conta, que têm pontos e hífens mas nunca `,` com dois dígitos.
 */
function tokenizeMovements(section: string): Token[] {
	const tokenRe = new RegExp(
		String.raw`(?<date>(\d{2})\s+([A-ZÇ]{3})\s+(\d{4}))` +
			String.raw`|(?<group>Total de (entradas|sa[íi]das)\s*([+-])?\s*(${AMOUNT}))` +
			`|(?<amount>${AMOUNT})`,
		"gi",
	);

	const tokens: Token[] = [];

	for (const match of section.matchAll(tokenRe)) {
		const start = match.index ?? 0;
		const end = start + match[0].length;

		if (match.groups?.date) {
			const date = parsePortugueseShortDate(
				match[2] ?? "",
				match[3] ?? "",
				Number.parseInt(match[4] ?? "", 10),
			);
			if (date) tokens.push({ kind: "date", end, date });
			continue;
		}

		if (match.groups?.group) {
			const declared = parseBrazilianAmountOrNull(match[8] ?? "");
			if (declared == null) continue;
			tokens.push({
				kind: "group",
				end,
				direction: /sa[íi]da/i.test(match[6] ?? "") ? "out" : "in",
				declared: Math.abs(declared),
			});
			continue;
		}

		const amount = parseBrazilianAmountOrNull(match[0]);
		if (amount == null) continue;
		tokens.push({ kind: "amount", start, end, amount: Math.abs(amount) });
	}

	return tokens;
}

export type NubankStatementGroupCheck = {
	date: string;
	direction: "in" | "out";
	declared: number;
	parsed: number;
	balances: boolean;
};

export type NubankStatementParseResult = {
	transactions: ImportedTransaction[];
	groups: NubankStatementGroupCheck[];
};

export function parseNubankStatementMovements(
	text: string,
): NubankStatementParseResult {
	const start = text.search(/Movimenta[çc][õo]es/i);
	if (start === -1) return { transactions: [], groups: [] };

	const section = stripPageNoise(text.slice(start));
	const tokens = tokenizeMovements(section);

	const transactions: ImportedTransaction[] = [];
	const groups: NubankStatementGroupCheck[] = [];

	let currentDate: string | null = null;
	let currentDirection: "in" | "out" | null = null;
	let cursor = 0;

	for (const token of tokens) {
		if (token.kind === "date") {
			currentDate = token.date;
			cursor = token.end;
			continue;
		}

		if (token.kind === "group") {
			currentDirection = token.direction;
			groups.push({
				date: currentDate ?? "",
				direction: token.direction,
				declared: token.declared,
				parsed: 0,
				balances: false,
			});
			cursor = token.end;
			continue;
		}

		// Valor sem data ou sem direção não é lançamento: é ruído de layout.
		if (!currentDate || !currentDirection) {
			cursor = token.end;
			continue;
		}

		const description = normalizeImportedText(
			section.slice(cursor, token.start),
		);
		cursor = token.end;

		if (!description) continue;

		transactions.push({
			// Mesma forma do extrato Inter em PDF: sem id do banco, a identidade
			// da linha é data + valor + descrição. Sem ela, reimportar um recorte
			// que se sobreponha duplicaria tudo.
			externalId: makeSyntheticExternalId([
				currentDate,
				String(token.amount),
				description,
			]),
			date: currentDate,
			amount: token.amount,
			description,
			transactionType: currentDirection === "in" ? "income" : "expense",
		});

		const group = groups.at(-1);
		if (group) group.parsed = roundMoney(group.parsed + token.amount);
	}

	for (const group of groups) {
		group.balances =
			Math.abs(group.parsed - group.declared) <= SOURCE_ROUNDING_TOLERANCE;
	}

	return { transactions, groups };
}

/**
 * Titular do extrato: nome e documento mascarado do cabeçalho.
 *
 * O cabeçalho abre cada página com "<nome> •••.532.298-•• 0001 CPF Agência
 * Conta <número>". O mesmo mascaramento aparece na descrição de um Pix entre
 * contas próprias, e é o que permite reconhecê-lo sem depender de cadastro.
 */
export function parseStatementHolder(
	text: string,
): { name: string | null; document: string | null } | null {
	const match = text.match(
		/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{5,80}?)\s*(•+\.\d{3}\.\d{3}-•+)\s+\d{4}\s+CPF/,
	);
	if (!match) return null;

	const name = normalizeImportedText(match[1] ?? "");
	const document = (match[2] ?? "").trim();

	if (!name && !document) return null;
	return { name: name || null, document: document || null };
}

function parseStatementPeriod(
	text: string,
): { from: string; to: string } | null {
	const match = text.match(
		/(\d{2}) DE ([A-ZÇ]+) DE (\d{4})\s+(\d{2}) DE ([A-ZÇ]+) DE (\d{4})/i,
	);
	if (!match) return null;

	const from = parsePortugueseLongDate(
		match[1] ?? "",
		match[2] ?? "",
		match[3] ?? "",
	);
	const to = parsePortugueseLongDate(
		match[4] ?? "",
		match[5] ?? "",
		match[6] ?? "",
	);

	return from && to ? { from, to } : null;
}

export function parseNubankBankStatementPdf(text: string): ImportStatement {
	const { transactions } = parseNubankStatementMovements(text);

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada no extrato Nubank.");
	}

	const accountMatch = text.match(/Conta\s+(\d{6,}-\d)/i);
	const period = parseStatementPeriod(text);
	const balanceBlock = parseNubankStatementBalances(text);

	const accountBalances: AccountStatementBalances | null =
		balanceBlock &&
		period &&
		balanceBlock.openingBalance != null &&
		balanceBlock.closingBalance != null
			? {
					openingBalance: balanceBlock.openingBalance,
					closingBalance: balanceBlock.closingBalance,
					yield: balanceBlock.yield,
					totalIn: balanceBlock.totalIn,
					totalOut: balanceBlock.totalOut,
					periodFrom: period.from,
					periodTo: period.to,
					balances: balanceBlock.balances,
				}
			: null;

	return {
		source: "Nubank",
		accountNumber: accountMatch?.[1] ?? null,
		period,
		isCreditCard: false,
		accountHolder: parseStatementHolder(text),
		accountBalances,
		transactions,
	};
}
