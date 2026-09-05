import { parseImportPdfClient } from "@/features/transactions/lib/import-api-client";
import {
	type ParseImportFileOptions,
	parseImportFile,
} from "@/shared/lib/import/parse-import-file";
import {
	PdfPasswordIncorrectError,
	PdfPasswordRequiredError,
} from "@/shared/lib/import/pdf-password";
import type { ImportStatement } from "@/shared/lib/import/types";
import { formatBytes } from "@/shared/utils/number";

export type ImportUploadLogStatus = "info" | "pending" | "success" | "error";

export type ParseImportFileClientOptions = ParseImportFileOptions & {
	cardId?: string | null;
	onLog?: (message: string, status?: ImportUploadLogStatus) => void;
};

function isPdfFile(file: File): boolean {
	const extension = file.name.split(".").pop()?.toLowerCase();
	return extension === "pdf" || file.type === "application/pdf";
}

export async function parseImportFileClient(
	file: File,
	options?: ParseImportFileClientOptions,
): Promise<ImportStatement> {
	const log = (message: string, status: ImportUploadLogStatus = "info") => {
		options?.onLog?.(message, status);
	};

	if (!isPdfFile(file)) {
		log(`Lendo ${file.name} (${formatBytes(file.size)})...`, "pending");
		const statement = await parseImportFile(file, options);
		log("Arquivo lido com sucesso.", "success");
		log(
			`${statement.transactions.length} transação(ões) encontrada(s)${statement.source ? ` — ${statement.source}` : ""}`,
			"success",
		);
		return statement;
	}

	log(`Enviando PDF (${formatBytes(file.size)}) para o servidor...`, "pending");

	const formData = new FormData();
	formData.append("file", file);

	if (options?.pdfPassword?.trim()) {
		formData.append("pdfPassword", options.pdfPassword.trim());
	}

	if (options?.cardId) {
		formData.append("cardId", options.cardId);
	}

	if (
		!options?.pdfPassword?.trim() &&
		options?.pdfPasswordCandidates &&
		options.pdfPasswordCandidates.length > 0
	) {
		formData.append(
			"pdfPasswordCandidates",
			JSON.stringify(options.pdfPasswordCandidates),
		);
	}

	const result = await parseImportPdfClient(formData);

	for (const entry of result.logs) {
		log(entry, "success");
	}

	if (result.success) {
		return result.statement;
	}

	if (result.errorName === "PdfPasswordRequiredError") {
		throw new PdfPasswordRequiredError(result.error);
	}

	if (result.errorName === "PdfPasswordIncorrectError") {
		throw new PdfPasswordIncorrectError(result.error);
	}

	throw new Error(result.error);
}
