import { z } from "zod";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	buildImportDuplicateValidation,
	type ImportDuplicateSnapshot,
	type ImportDuplicateValidation,
} from "@/features/transactions/lib/import-duplicate-match";

export const IMPORT_AI_BATCH_SIZE = 40;

export const IMPORT_AI_DUPLICATE_CONFIDENCE = 0.72;
export const IMPORT_AI_CATEGORY_CONFIDENCE = 0.62;

export const ImportAiDuplicateVerdictSchema = z.enum([
	"new",
	"duplicate",
	"likely_duplicate",
	"uncertain",
]);

function normalizeOptionalUuid(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const parsed = z.string().uuid().safeParse(trimmed);
	return parsed.success ? parsed.data : null;
}

function normalizeDuplicateVerdict(
	value: unknown,
): z.infer<typeof ImportAiDuplicateVerdictSchema> {
	const parsed = ImportAiDuplicateVerdictSchema.safeParse(value);
	return parsed.success ? parsed.data : "uncertain";
}

function normalizeConfidence(value: unknown): number {
	const parsed = z.coerce.number().finite().safeParse(value);
	if (!parsed.success) return 0;
	return Math.min(1, Math.max(0, parsed.data));
}

export const ImportAiRowResultSchema = z.object({
	rowIndex: z.coerce.number().int().min(0),
	duplicateVerdict: z.preprocess(
		normalizeDuplicateVerdict,
		ImportAiDuplicateVerdictSchema,
	),
	matchedExistingId: z.preprocess(
		normalizeOptionalUuid,
		z.string().uuid().nullable(),
	),
	suggestedCategoryId: z.preprocess(
		normalizeOptionalUuid,
		z.string().uuid().nullable(),
	),
	confidence: z.preprocess(normalizeConfidence, z.number().min(0).max(1)),
	summary: z.preprocess(
		(value) => (typeof value === "string" ? value.trim().slice(0, 160) : ""),
		z.string().max(160),
	),
});

export const ImportAiBatchResponseSchema = z.object({
	rows: z.array(ImportAiRowResultSchema),
});

export type ImportAiRowResult = z.infer<typeof ImportAiRowResultSchema>;

export type ImportAiAnalysisRowInput = {
	rowIndex: number;
	description: string;
	sourceDescription: string;
	amount: number;
	date: string;
	transactionType: "income" | "expense";
	kind: ReviewRow["kind"];
	installment: {
		name: string;
		currentInstallment: number;
		installmentCount: number;
	} | null;
	installmentImport: ReviewRow["installmentImport"];
	algorithmDuplicate: {
		isDuplicate: boolean;
		status: ImportDuplicateValidation["status"] | null;
		existingTransactionId: string | null;
	};
	currentCategoryId: string | null;
	isDuplicate: boolean;
	selected: boolean;
	linked?: boolean;
	reimported?: boolean;
};

export type ImportAiCategoryInput = {
	id: string;
	name: string;
	transactionType: "income" | "expense";
};

export type ImportAiExistingCandidate = {
	id: string;
	name: string;
	amount: number;
	date: string | null;
	period: string | null;
	installment: string | null;
	categoryId: string | null;
};

export type ImportAiRowPatch = {
	rowIndex: number;
	isDuplicate?: boolean;
	selected?: boolean;
	duplicateValidation?: ImportDuplicateValidation | null;
	categoryId?: string | null;
	aiSuggestion: {
		duplicate?: boolean;
		category?: boolean;
		note?: string;
		confidence: number;
	};
};

export const IMPORT_AI_SYSTEM_PROMPT = `Você é um analista financeiro especializado em conciliação de extratos e faturas de cartão no OpenMonetis.

Sua tarefa é revisar lançamentos importados de um arquivo e, para CADA linha do lote:
1. Decidir se já existe no cadastro do usuário (duplicata) — use principalmente nome/estabelecimento, parcela N/M e valor. A DATA do extrato NÃO é confiável em parcelamentos (ex.: Nubank reescreve a data a cada fatura).
2. Sugerir a categoria mais adequada dentre as categorias fornecidas (somente IDs válidos da lista).

Regras obrigatórias:
- matchedExistingId DEVE ser null ou um id EXATO de "existingCandidates".
- suggestedCategoryId DEVE ser null ou um id EXATO de "categories".
- Respeite o tipo da linha (income/expense) ao sugerir categoria.
- Para pagamentos de fatura e transferências, não sugira categoria se kind não for "transaction".
- duplicateVerdict:
  - "duplicate": mesma compra/parcela já cadastrada com alta confiança
  - "likely_duplicate": provável duplicata, mas com alguma ambiguidade
  - "new": lançamento novo
  - "uncertain": não foi possível decidir
- Se algorithmDuplicate já marcou match, confirme salvo evidência contrária forte.
- summary: frase curta em português (máx. 120 caracteres) explicando a decisão principal.
- confidence: 0 a 1 refletindo certeza geral da linha.

Responda APENAS com JSON válido no schema solicitado.`;

export function chunkImportAiRows<T>(
	rows: T[],
	size = IMPORT_AI_BATCH_SIZE,
): T[][] {
	if (rows.length === 0) return [];

	const chunks: T[][] = [];
	for (let index = 0; index < rows.length; index += size) {
		chunks.push(rows.slice(index, index + size));
	}
	return chunks;
}

export function buildImportAiBatchPrompt(input: {
	context: {
		isCreditCard: boolean;
		invoicePeriod: string | null;
		cardName: string | null;
		accountName: string | null;
	};
	categories: ImportAiCategoryInput[];
	existingCandidates: ImportAiExistingCandidate[];
	rows: ImportAiAnalysisRowInput[];
	batchIndex: number;
	totalBatches: number;
}): string {
	return `Contexto da importação:
${JSON.stringify(input.context, null, 2)}

Lote ${input.batchIndex + 1} de ${input.totalBatches}.

Categorias disponíveis:
${JSON.stringify(input.categories, null, 2)}

Lançamentos já cadastrados (candidatos a duplicata):
${JSON.stringify(input.existingCandidates, null, 2)}

Linhas importadas para analisar neste lote:
${JSON.stringify(input.rows, null, 2)}

Analise cada item de "rows" e retorne um objeto por rowIndex.`;
}

export function mapExistingSnapshotToAiCandidate(
	snapshot: ImportDuplicateSnapshot & { period?: string | null },
): ImportAiExistingCandidate {
	const installment =
		snapshot.currentInstallment && snapshot.installmentCount
			? `${snapshot.currentInstallment}/${snapshot.installmentCount}`
			: null;

	return {
		id: snapshot.id,
		name: snapshot.name,
		amount: Math.abs(Number(snapshot.amount)),
		date: snapshot.purchaseDate
			? snapshot.purchaseDate.toISOString().slice(0, 10)
			: null,
		period: snapshot.period ?? null,
		installment,
		categoryId: snapshot.categoryId,
	};
}

function isDuplicateVerdict(
	verdict: ImportAiRowResult["duplicateVerdict"],
): boolean {
	return verdict === "duplicate" || verdict === "likely_duplicate";
}

export function buildImportAiRowPatch(
	row: ImportAiAnalysisRowInput,
	analysis: ImportAiRowResult,
	existingById: Map<string, ImportDuplicateSnapshot>,
	options: {
		isCategoryCompatible: (
			categoryId: string | null,
			transactionType: ReviewRow["transactionType"],
		) => boolean;
	},
): ImportAiRowPatch | null {
	if (row.linked || row.reimported) return null;

	const aiSuggestion: ImportAiRowPatch["aiSuggestion"] = {
		confidence: analysis.confidence,
		note: analysis.summary.trim() || undefined,
	};

	const patch: ImportAiRowPatch = {
		rowIndex: analysis.rowIndex,
		aiSuggestion,
	};

	const existingSnapshot = analysis.matchedExistingId
		? (existingById.get(analysis.matchedExistingId) ?? null)
		: null;

	const shouldApplyDuplicate =
		isDuplicateVerdict(analysis.duplicateVerdict) &&
		analysis.confidence >= IMPORT_AI_DUPLICATE_CONFIDENCE &&
		existingSnapshot != null &&
		!row.isDuplicate;

	if (shouldApplyDuplicate && existingSnapshot) {
		const validation = buildImportDuplicateValidation(
			{
				date: row.date,
				amount: row.amount,
				description: row.description,
				transactionType: row.transactionType,
				installmentImport: row.installmentImport,
			},
			existingSnapshot,
			analysis.duplicateVerdict === "likely_duplicate" &&
				analysis.confidence < 0.85
				? "link_suggestion"
				: undefined,
		);

		patch.isDuplicate = validation.status !== "link_suggestion";
		patch.duplicateValidation = validation;
		patch.selected = false;
		aiSuggestion.duplicate = true;
	}

	const shouldApplyCategory =
		row.kind === "transaction" &&
		!row.currentCategoryId &&
		analysis.suggestedCategoryId &&
		analysis.confidence >= IMPORT_AI_CATEGORY_CONFIDENCE &&
		options.isCategoryCompatible(
			analysis.suggestedCategoryId,
			row.transactionType,
		);

	if (shouldApplyCategory && analysis.suggestedCategoryId) {
		patch.categoryId = analysis.suggestedCategoryId;
		aiSuggestion.category = true;
	}

	if (!aiSuggestion.duplicate && !aiSuggestion.category) {
		if (analysis.summary.trim()) {
			return {
				rowIndex: analysis.rowIndex,
				aiSuggestion,
			};
		}
		return null;
	}

	return patch;
}

export function applyImportAiPatchesToRows(
	rows: ReviewRow[],
	patches: ImportAiRowPatch[],
): ReviewRow[] {
	if (patches.length === 0) return rows;

	const patchByIndex = new Map(patches.map((patch) => [patch.rowIndex, patch]));

	return rows.map((row, index) => {
		const patch = patchByIndex.get(index);
		if (!patch) return row;

		return {
			...row,
			categoryId: patch.categoryId ?? row.categoryId,
			isDuplicate: patch.isDuplicate ?? row.isDuplicate,
			selected: patch.selected ?? row.selected,
			duplicateValidation: patch.duplicateValidation ?? row.duplicateValidation,
			aiSuggestion: {
				...row.aiSuggestion,
				...patch.aiSuggestion,
			},
		};
	});
}

export function buildImportAiAnalysisPayload(input: {
	rows: ReviewRow[];
	isCreditCard: boolean;
	cardId: string | null;
	invoicePeriods: string[];
	accountId: string | null;
	statementPeriod: { from: string; to: string } | null;
	cardName: string | null;
	accountName: string | null;
	categories: ImportAiCategoryInput[];
	categoryCompatibility: Array<{
		categoryId: string;
		transactionType: "income" | "expense";
		compatible: boolean;
	}>;
}) {
	return {
		isCreditCard: input.isCreditCard,
		cardId: input.cardId,
		invoicePeriods: input.invoicePeriods,
		accountId: input.accountId,
		statementPeriod: input.statementPeriod,
		cardName: input.cardName,
		accountName: input.accountName,
		categories: input.categories,
		categoryCompatibility: input.categoryCompatibility,
		rows: input.rows.map((row, rowIndex) => ({
			rowIndex,
			description: row.description,
			sourceDescription: row.sourceDescription,
			amount: row.amount,
			date: row.date,
			transactionType: row.transactionType,
			kind: row.kind,
			installment:
				row.installmentImport?.enabled &&
				row.installmentImport.currentInstallment &&
				row.installmentImport.installmentCount
					? {
							name: row.installmentImport.name,
							currentInstallment: row.installmentImport.currentInstallment,
							installmentCount: row.installmentImport.installmentCount,
						}
					: null,
			installmentImport: row.installmentImport,
			algorithmDuplicate: {
				isDuplicate: row.isDuplicate,
				status: row.duplicateValidation?.status ?? null,
				existingTransactionId:
					row.duplicateValidation?.existingTransactionId ?? null,
			},
			currentCategoryId: row.categoryId,
			isDuplicate: row.isDuplicate,
			selected: row.selected,
			linked: row.linked,
			reimported: row.reimported,
		})),
	};
}
