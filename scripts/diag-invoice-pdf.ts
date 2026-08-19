/**
 * Diagnóstico de fatura: mostra o que o parser extraiu do PDF, o total que ele
 * detectou no cabeçalho e — o mais útil — as linhas com valor que ficaram de
 * fora dos lançamentos. É por aí que aparece a diferença da conferência.
 *
 *   pnpm exec tsx scripts/diag-invoice-pdf.ts <caminho-do-pdf> [senha]
 */
import { readFile } from "node:fs/promises";
import { invoiceSourceTotalFromStatement } from "@/shared/lib/import/invoice-source-total";
import {
	displayInvoiceTotal,
	sumSignedAmountsForImportedTransactions,
} from "@/shared/lib/import/invoice-total";
import { extractPdfText, parsePdfText } from "@/shared/lib/import/pdf-parser";

const MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;

function toCents(raw: string): number {
	return Math.round(Number(raw.replace(/\./g, "").replace(",", ".")) * 100);
}

function brl(value: number): string {
	return value.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

async function main() {
	const [, , filePath, password] = process.argv;
	if (!filePath) {
		console.error(
			"uso: pnpm exec tsx scripts/diag-invoice-pdf.ts <pdf> [senha]",
		);
		process.exit(1);
	}

	const buffer = await readFile(filePath);
	const text = await extractPdfText(
		buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		) as ArrayBuffer,
		password,
	);
	const statement = parsePdfText(text);

	const rowsTotal = displayInvoiceTotal(
		sumSignedAmountsForImportedTransactions(statement.transactions),
	);
	const sourceTotal = invoiceSourceTotalFromStatement(statement);

	console.log("=== o que o parser extraiu ===");
	console.log(`lançamentos: ${statement.transactions.length}`);
	console.log(`soma dos lançamentos: ${brl(rowsTotal)}`);
	console.log(
		`total detectado no arquivo: ${
			sourceTotal
				? `${brl(sourceTotal.amount)} (${sourceTotal.kind})`
				: "nenhum"
		}`,
	);
	if (sourceTotal) {
		console.log(`diferença: ${brl(rowsTotal - sourceTotal.amount)}`);
	}

	// Consome os valores já explicados pelos lançamentos; o que sobra em cada
	// linha do PDF é candidato à diferença.
	const parsedCents = new Map<number, number>();
	for (const transaction of statement.transactions) {
		const cents = Math.round(Math.abs(transaction.amount) * 100);
		parsedCents.set(cents, (parsedCents.get(cents) ?? 0) + 1);
	}

	console.log("\n=== linhas do PDF com valor que NÃO viraram lançamento ===");
	let orphanCount = 0;
	for (const line of text.split("\n")) {
		const matches = line.match(MONEY_RE);
		if (!matches) continue;

		const orphans = matches.filter((raw) => {
			const cents = Math.abs(toCents(raw));
			const available = parsedCents.get(cents) ?? 0;
			if (available > 0) {
				parsedCents.set(cents, available - 1);
				return false;
			}
			return true;
		});

		if (orphans.length === 0) continue;
		orphanCount += orphans.length;
		console.log(`  ${line.trim()}`);
	}

	if (orphanCount === 0) {
		console.log("  (nenhuma — o parser capturou todas as linhas com valor)");
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
