"use server";

import { z } from "zod/v4";
import { resolveCardImportPdfPasswordAttempts } from "@/features/cards/lib/resolve-import-pdf-password";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { MAX_FILE_SIZE } from "@/shared/lib/attachments/config";
import { getUserId } from "@/shared/lib/auth/server";
import { parsePdf } from "@/shared/lib/import/pdf-parser";
import {
	isPdfPasswordError,
	mapPdfLoadError,
} from "@/shared/lib/import/pdf-password";
import type { ImportStatement } from "@/shared/lib/import/types";
import { formatBytes } from "@/shared/utils/number";
import { uuidSchema } from "@/shared/lib/schemas/common";

const optionsSchema = z.object({
	pdfPassword: z.string().optional(),
	cardId: uuidSchema("Cartão").optional(),
	pdfPasswordCandidates: z.array(z.string()).optional(),
});

type ParseImportPdfSuccess = {
	success: true;
	statement: ImportStatement;
	logs: string[];
};

type ParseImportPdfFailure = {
	success: false;
	error: string;
	errorName?: string;
	logs: string[];
};

export async function parseImportPdfAction(
	formData: FormData,
): Promise<ParseImportPdfSuccess | ParseImportPdfFailure> {
	const logs: string[] = [];

	try {
		const file = formData.get("file");
		if (!(file instanceof File)) {
			return { success: false, error: "Arquivo não enviado.", logs };
		}

		logs.push(`Recebido: ${file.name} (${formatBytes(file.size)})`);

		if (!file.name.toLowerCase().endsWith(".pdf")) {
			logs.push("Formato inválido: esperado PDF.");
			return { success: false, error: "O arquivo enviado não é um PDF.", logs };
		}

		if (file.size > MAX_FILE_SIZE) {
			logs.push("Arquivo excede o limite de 50MB.");
			return { success: false, error: "Arquivo deve ter no máximo 50MB.", logs };
		}

		const candidatesRaw = formData.get("pdfPasswordCandidates");
		let parsedCandidates: string[] | undefined;
		if (typeof candidatesRaw === "string" && candidatesRaw.trim()) {
			parsedCandidates = JSON.parse(candidatesRaw) as string[];
		}

		const options = optionsSchema.parse({
			pdfPassword: formData.get("pdfPassword")?.toString() || undefined,
			cardId: formData.get("cardId")?.toString() || undefined,
			pdfPasswordCandidates: parsedCandidates,
		});

		const userId = await getUserId();

		let extraCandidates: string[] = [];
		if (options.pdfPassword?.trim()) {
			extraCandidates = [];
			logs.push("Usando senha informada manualmente.");
		} else if (options.pdfPasswordCandidates?.length) {
			extraCandidates = options.pdfPasswordCandidates;
			logs.push(
				`Tentando ${extraCandidates.length} senha(s) salva(s) no cartão...`,
			);
		} else if (options.cardId) {
			logs.push("Buscando senhas salvas do cartão...");
			extraCandidates = await resolveCardImportPdfPasswordAttempts(
				userId,
				options.cardId,
			);
			if (extraCandidates.length > 0) {
				logs.push(`${extraCandidates.length} senha(s) encontrada(s).`);
			}
		}

		logs.push("Abrindo e extraindo texto do PDF...");
		const statement = await parsePdf(
			await file.arrayBuffer(),
			options.pdfPassword,
			extraCandidates,
		);

		logs.push(
			`${statement.transactions.length} transação(ões) encontrada(s)${statement.source ? ` — ${statement.source}` : ""}`,
		);

		return { success: true, statement, logs };
	} catch (error) {
		const passwordAttempted = Boolean(
			formData.get("pdfPassword")?.toString()?.trim() ||
				formData.get("pdfPasswordCandidates")?.toString()?.trim() ||
				formData.get("cardId")?.toString()?.trim(),
		);
		const mapped = mapPdfLoadError(error, passwordAttempted);

		if (isPdfPasswordError(mapped)) {
			logs.push(mapped.message);
			return {
				success: false,
				error: mapped.message,
				errorName: mapped.name,
				logs,
			};
		}

		const result = handleActionError(error);
		if (!result.success) {
			logs.push(result.error);
			return { success: false, error: result.error, logs };
		}

		logs.push(mapped.message);
		return {
			success: false,
			error: mapped.message,
			logs,
		};
	}
}
