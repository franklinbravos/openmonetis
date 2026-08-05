import { buildPeriodFromTransactions, parseCnabDate } from "./helpers";
import type { ImportedTransaction, ImportStatement } from "./types";

function isCnab240(content: string): boolean {
	return content
		.split(/\r?\n/)
		.some((line) => line.startsWith("07700013") && line[13] === "E");
}

function parseCnabSegmentE(line: string): ImportedTransaction | null {
	const segmentIndex = line.indexOf("S");
	if (segmentIndex === -1) return null;

	const seg = line.slice(segmentIndex + 1);
	if (seg.length < 67) return null;

	const date = parseCnabDate(seg.slice(0, 8));
	if (!date) return null;

	const centsRaw = seg.slice(16, 34);
	const cents = Number.parseInt(centsRaw, 10);
	if (Number.isNaN(cents)) return null;

	const creditDebit = seg[34];
	const description = seg.slice(42, 67).trim();
	const externalId = seg.slice(67).trim() || null;

	if (!description) return null;

	const amount = cents / 100;
	const transactionType = creditDebit === "C" ? "income" : "expense";

	return {
		externalId,
		date,
		amount,
		description,
		transactionType,
	};
}

export function parseCnab(content: string): ImportStatement {
	if (!isCnab240(content)) {
		throw new Error("Formato CNAB não reconhecido.");
	}

	const lines = content.split(/\r?\n/).map((line) => line.trimEnd());
	let accountNumber: string | null = null;
	let period: { from: string; to: string } | null = null;

	const headerLine = lines.find((line) => line.startsWith("07700000"));
	if (headerLine) {
		const accountMatch = headerLine.match(/0000190000(\d{9})/);
		accountNumber = accountMatch?.[1] ?? null;
	}

	const batchHeader = lines.find((line) => line.startsWith("07700011"));
	const trailerLine = lines.find((line) => line.startsWith("07700015"));

	if (batchHeader && trailerLine) {
		const fromMatch = batchHeader.match(/(\d{8})000000000000/);
		const from = fromMatch ? parseCnabDate(fromMatch[1]) : null;

		const cpIndex = trailerLine.indexOf("CP");
		const trailerTail =
			cpIndex > 0
				? trailerLine.slice(Math.max(0, cpIndex - 50), cpIndex + 2)
				: "";
		const toMatch = trailerTail.match(/(\d{8})0+(\d{6,8})CP/);
		const to = toMatch ? parseCnabDate(toMatch[1]) : null;

		if (from && to) period = { from, to };
	}

	const transactions: ImportedTransaction[] = [];

	for (const line of lines) {
		if (!line.startsWith("07700013")) continue;
		if (line[13] !== "E") continue;

		const transaction = parseCnabSegmentE(line);
		if (transaction) transactions.push(transaction);
	}

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada no arquivo CNAB.");
	}

	return {
		source: "Banco Inter",
		accountNumber,
		period: period ?? buildPeriodFromTransactions(transactions),
		isCreditCard: false,
		transactions,
	};
}
