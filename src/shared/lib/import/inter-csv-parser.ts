import {
	buildPeriodFromTransactions,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parseSlashDateDMY,
} from "./helpers";
import type { ImportedTransaction, ImportStatement } from "./types";

function isInterCsv(content: string): boolean {
	const header = content.split(/\r?\n/).find((line) => line.includes(";"));
	return (
		content.includes("Data Lançamento") &&
		content.includes("Histórico") &&
		Boolean(header?.includes(";"))
	);
}

export function parseInterCsv(content: string): ImportStatement {
	if (!isInterCsv(content)) {
		throw new Error("Formato CSV não reconhecido.");
	}

	const lines = content.split(/\r?\n/).map((line) => line.trim());
	let accountNumber: string | null = null;
	let period: { from: string; to: string } | null = null;

	for (const line of lines) {
		if (line.toLowerCase().startsWith("conta")) {
			const parts = line.split(";");
			accountNumber = parts[1]?.trim() ?? null;
		}
		if (
			line.toLowerCase().startsWith("período") ||
			line.toLowerCase().startsWith("periodo")
		) {
			const match = line.match(
				/(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
			);
			if (match) {
				const from = parseSlashDateDMY(match[1]);
				const to = parseSlashDateDMY(match[2]);
				if (from && to) period = { from, to };
			}
		}
	}

	const headerIndex = lines.findIndex((line) =>
		line.toLowerCase().startsWith("data lançamento"),
	);
	if (headerIndex === -1) {
		throw new Error("Cabeçalho de transações não encontrado no CSV.");
	}

	const transactions: ImportedTransaction[] = [];

	for (const line of lines.slice(headerIndex + 1)) {
		if (!line || !line.includes(";")) continue;

		const [dateRaw, historico, descricao, valorRaw] = line.split(";");
		const date = parseSlashDateDMY(dateRaw?.trim() ?? "");
		if (!date) continue;

		const amountSigned = parseBrazilianAmount(valorRaw ?? "0");
		if (amountSigned === 0) continue;

		const historicoTrim = historico?.trim() ?? "";
		const descricaoTrim = descricao?.trim() ?? "";
		const description = descricaoTrim
			? historicoTrim
				? `${historicoTrim}: ${descricaoTrim}`
				: descricaoTrim
			: historicoTrim;

		const transactionType = amountSigned > 0 ? "income" : "expense";
		const amount = Math.abs(amountSigned);

		transactions.push({
			externalId: makeSyntheticExternalId([date, String(amount), description]),
			date,
			amount,
			description,
			transactionType,
		});
	}

	if (transactions.length === 0) {
		throw new Error("Nenhuma transação encontrada no CSV.");
	}

	return {
		source: "Banco Inter",
		accountNumber,
		period: period ?? buildPeriodFromTransactions(transactions),
		isCreditCard: false,
		transactions,
	};
}
