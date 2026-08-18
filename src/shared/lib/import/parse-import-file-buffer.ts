import { parseCnab } from "./cnab-parser";
import { normalizeImportedText } from "./helpers";
import { parseInterCsv } from "./inter-csv-parser";
import { parseOfx } from "./ofx-parser";
import { parsePdf } from "./pdf-parser";
import type { ImportStatement } from "./types";
import { parseXls } from "./xls-parser";

function normalizeImportStatement(statement: ImportStatement): ImportStatement {
	return {
		...statement,
		transactions: statement.transactions.map((transaction) => ({
			...transaction,
			description: normalizeImportedText(transaction.description),
			categoryRaw: transaction.categoryRaw
				? normalizeImportedText(transaction.categoryRaw)
				: transaction.categoryRaw,
		})),
	};
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength,
	) as ArrayBuffer;
}

function decodeText(buffer: Buffer, encoding: string): string {
	return new TextDecoder(encoding).decode(buffer);
}

export async function parseImportFileFromBuffer(
	fileName: string,
	buffer: Buffer,
): Promise<ImportStatement> {
	const extension = fileName.split(".").pop()?.toLowerCase();

	switch (extension) {
		case "ofx":
		case "qfx":
			return normalizeImportStatement(
				parseOfx(decodeText(buffer, "windows-1252"), { fileName }),
			);
		case "xlsx":
		case "xls":
			return normalizeImportStatement(
				await parseXls(bufferToArrayBuffer(buffer)),
			);
		case "csv":
			return normalizeImportStatement(
				parseInterCsv(decodeText(buffer, "utf-8")),
			);
		case "txt":
			return normalizeImportStatement(parseCnab(decodeText(buffer, "utf-8")));
		case "pdf":
			return normalizeImportStatement(
				await parsePdf(bufferToArrayBuffer(buffer)),
			);
		default:
			throw new Error(
				"Formato não suportado. Use .ofx, .qfx, .csv, .txt, .pdf, .xlsx ou .xls.",
			);
	}
}
