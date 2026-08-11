import { parseCnab } from "./cnab-parser";
import { normalizeImportedText } from "./helpers";
import { parseInterCsv } from "./inter-csv-parser";
import { parseOfx } from "./ofx-parser";
import { parsePdf } from "./pdf-parser";
import type { ImportStatement } from "./types";
import { parseXls } from "./xls-parser";

export type ParseImportFileOptions = {
	pdfPassword?: string;
	pdfPasswordCandidates?: string[];
};

const SUPPORTED_EXTENSIONS = /\.(ofx|qfx|xlsx|xls|csv|txt|pdf)$/i;

export function isSupportedImportFile(fileName: string): boolean {
	return SUPPORTED_EXTENSIONS.test(fileName);
}

export async function parseImportFile(
	file: File,
	options?: ParseImportFileOptions,
): Promise<ImportStatement> {
	const extension = file.name.split(".").pop()?.toLowerCase();

	switch (extension) {
		case "ofx":
		case "qfx": {
			const content = await readAsText(file, "windows-1252");
			return normalizeImportStatement(
				parseOfx(content, { fileName: file.name }),
			);
		}
		case "xlsx":
		case "xls":
			return normalizeImportStatement(
				await parseXls(await readAsArrayBuffer(file)),
			);
		case "csv": {
			const content = await readAsText(file, "utf-8");
			return normalizeImportStatement(parseInterCsv(content));
		}
		case "txt": {
			const content = await readAsText(file, "utf-8");
			return normalizeImportStatement(parseCnab(content));
		}
		case "pdf":
			return normalizeImportStatement(
				await parsePdf(
					await readAsArrayBuffer(file),
					options?.pdfPassword,
					options?.pdfPasswordCandidates,
				),
			);
		default:
			throw new Error(
				"Formato não suportado. Use .ofx, .qfx, .csv, .txt, .pdf, .xlsx ou .xls.",
			);
	}
}

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

function readAsText(file: File, encoding: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
		reader.readAsText(file, encoding);
	});
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
		reader.readAsArrayBuffer(file);
	});
}
