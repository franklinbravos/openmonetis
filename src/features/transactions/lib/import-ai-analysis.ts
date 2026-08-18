import { z } from "zod";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	buildImportDuplicateValidation,
	type ImportDuplicateSnapshot,
	type ImportDuplicateValidation,
} from "@/features/transactions/lib/import-duplicate-match";
import { isInvoiceExtraReviewRow } from "@/features/transactions/lib/import-invoice-extra-rows";
import { toDateOnlyString } from "@/shared/utils/date";

export const IMPORT_AI_FIRST_BATCH_SIZE = 12;
export const IMPORT_AI_BATCH_SIZE = 24;
export const IMPORT_AI_MAX_CANDIDATES_PER_BATCH = 80;
export const IMPORT_AI_PARALLEL_BATCH_LIMIT = 2;

/** @deprecated Use IMPORT_AI_BATCH_SIZE — mantido para compatibilidade interna */
export const IMPORT_AI_LEGACY_BATCH_SIZE = 18;

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
	kind: Exclude<ReviewRow["kind"], "invoice_extra">;
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

export type ImportAiAnalysisMode = "category" | "duplicate";

export type ImportAiPartitionedRows = {
	categoryRows: ImportAiAnalysisRowInput[];
	duplicateRows: ImportAiAnalysisRowInput[];
	skippedCount: number;
};

export type ImportAiRowEditSnapshot = {
	categoryId: string | null;
	isDuplicate: boolean;
};

export const IMPORT_AI_CATEGORY_SYSTEM_PROMPT = `Você é um analista financeiro especializado em categorização de lançamentos no OpenMonetis.

Sua tarefa é sugerir a categoria mais adequada para CADA linha do lote, usando somente IDs da lista "categories".

Regras obrigatórias:
- suggestedCategoryId DEVE ser null ou um id EXATO de "categories".
- Respeite o tipo da linha (income/expense) ao sugerir categoria.
- duplicateVerdict deve ser sempre "new" e matchedExistingId sempre null (este lote não analisa duplicatas).
- summary: frase curta em português (máx. 120 caracteres) explicando a escolha da categoria.
- confidence: 0 a 1 refletindo certeza da categoria sugerida.

Responda APENAS com JSON válido: {"rows":[{"rowIndex":number,"duplicateVerdict":"new","matchedExistingId":null,"suggestedCategoryId":string|null,"confidence":number,"summary":string}]}.`;

export const IMPORT_AI_DUPLICATE_SYSTEM_PROMPT = `Você é um analista financeiro especializado em conciliação de extratos e faturas de cartão no OpenMonetis.

Sua tarefa é decidir se CADA linha do lote já existe no cadastro do usuário (duplicata). Use principalmente nome/estabelecimento, parcela N/M e valor. A DATA do extrato NÃO é confiável em parcelamentos.

Regras obrigatórias:
- matchedExistingId DEVE ser null ou um id EXATO de "existingCandidates".
- suggestedCategoryId deve ser sempre null (este lote não sugere categorias).
- duplicateVerdict:
  - "duplicate": mesma compra/parcela já cadastrada com alta confiança
  - "likely_duplicate": provável duplicata, mas com alguma ambiguidade
  - "new": lançamento novo
  - "uncertain": não foi possível decidir
- Se algorithmDuplicate já marcou match, confirme salvo evidência contrária forte.
- summary: frase curta em português (máx. 120 caracteres).
- confidence: 0 a 1 refletindo certeza geral da decisão de duplicata.

Responda APENAS com JSON válido: {"rows":[{"rowIndex":number,"duplicateVerdict":"new"|"duplicate"|"likely_duplicate"|"uncertain","matchedExistingId":string|null,"suggestedCategoryId":null,"confidence":number,"summary":string}]}.`;

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

Responda APENAS com JSON válido no schema solicitado: {"rows":[{"rowIndex":number,"duplicateVerdict":"new"|"duplicate"|"likely_duplicate"|"uncertain","matchedExistingId":string|null,"suggestedCategoryId":string|null,"confidence":number,"summary":string}]}.`;

export function isRowEligibleForCategoryAi(
	row: ImportAiAnalysisRowInput,
): boolean {
	if (row.linked || row.reimported || !row.selected) return false;
	if (row.kind !== "transaction") return false;
	return !row.currentCategoryId;
}

export function isRowEligibleForDuplicateAi(
	row: ImportAiAnalysisRowInput,
): boolean {
	if (row.linked || row.reimported || row.isDuplicate) return false;
	if (row.algorithmDuplicate.isDuplicate) return false;
	if (row.algorithmDuplicate.status === "match") return false;

	return row.algorithmDuplicate.status === "link_suggestion";
}

export function partitionImportAiRows(
	rows: ImportAiAnalysisRowInput[],
): ImportAiPartitionedRows {
	const categoryRows: ImportAiAnalysisRowInput[] = [];
	const duplicateRows: ImportAiAnalysisRowInput[] = [];
	let skippedCount = 0;

	for (const row of rows) {
		const needsCategory = isRowEligibleForCategoryAi(row);
		const needsDuplicate = isRowEligibleForDuplicateAi(row);

		if (!needsCategory && !needsDuplicate) {
			skippedCount += 1;
			continue;
		}

		if (needsCategory) {
			categoryRows.push(row);
		}
		if (needsDuplicate) {
			duplicateRows.push(row);
		}
	}

	return { categoryRows, duplicateRows, skippedCount };
}

export function chunkImportAiRowsAdaptive<T>(
	rows: T[],
	options?: { firstBatchSize?: number; batchSize?: number },
): T[][] {
	if (rows.length === 0) return [];

	const firstBatchSize = options?.firstBatchSize ?? IMPORT_AI_FIRST_BATCH_SIZE;
	const batchSize = options?.batchSize ?? IMPORT_AI_BATCH_SIZE;
	const chunks: T[][] = [];

	chunks.push(rows.slice(0, firstBatchSize));

	for (let index = firstBatchSize; index < rows.length; index += batchSize) {
		chunks.push(rows.slice(index, index + batchSize));
	}

	return chunks;
}

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

export function buildImportAiCategoryBatchPrompt(input: {
	context: {
		isCreditCard: boolean;
		invoicePeriod: string | null;
		cardName: string | null;
		accountName: string | null;
	};
	categories: ImportAiCategoryInput[];
	rows: ImportAiAnalysisRowInput[];
	batchIndex: number;
	totalBatches: number;
}): string {
	const compactCategories = input.categories.map((category) => ({
		id: category.id,
		name: category.name,
		transactionType: category.transactionType,
	}));

	return `Contexto da importação:
${JSON.stringify(input.context, null, 2)}

Lote ${input.batchIndex + 1} de ${input.totalBatches} (somente categorização).

Categorias disponíveis:
${JSON.stringify(compactCategories, null, 2)}

Linhas importadas para categorizar neste lote:
${JSON.stringify(input.rows, null, 2)}

Sugira categoria para cada item de "rows" e retorne um objeto por rowIndex.`;
}

export function buildImportAiDuplicateBatchPrompt(input: {
	context: {
		isCreditCard: boolean;
		invoicePeriod: string | null;
		cardName: string | null;
		accountName: string | null;
	};
	existingCandidates: ImportAiExistingCandidate[];
	rows: ImportAiAnalysisRowInput[];
	batchIndex: number;
	totalBatches: number;
}): string {
	return `Contexto da importação:
${JSON.stringify(input.context, null, 2)}

Lote ${input.batchIndex + 1} de ${input.totalBatches} (somente duplicatas ambíguas).

Lançamentos já cadastrados (candidatos a duplicata):
${JSON.stringify(input.existingCandidates, null, 2)}

Linhas importadas para analisar neste lote:
${JSON.stringify(input.rows, null, 2)}

Analise cada item de "rows" e retorne um objeto por rowIndex.`;
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

function normalizeCandidateName(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function namesAreSimilar(left: string, right: string): boolean {
	const normalizedLeft = normalizeCandidateName(left);
	const normalizedRight = normalizeCandidateName(right);
	if (!normalizedLeft || !normalizedRight) return false;

	if (
		normalizedLeft.includes(normalizedRight) ||
		normalizedRight.includes(normalizedLeft)
	) {
		return true;
	}

	const leftTokens = new Set(normalizedLeft.split(" "));
	const sharedTokens = normalizedRight
		.split(" ")
		.filter((token) => leftTokens.has(token));

	return sharedTokens.length >= 2;
}

export function filterExistingCandidatesForBatch(
	batchRows: ImportAiAnalysisRowInput[],
	allCandidates: ImportAiExistingCandidate[],
	max = IMPORT_AI_MAX_CANDIDATES_PER_BATCH,
): ImportAiExistingCandidate[] {
	if (allCandidates.length <= max) {
		return allCandidates;
	}

	const batchAmounts = new Set(
		batchRows.map((row) => Math.abs(Number(row.amount))),
	);

	const scored = allCandidates.map((candidate) => {
		let score = 0;

		if (batchAmounts.has(Math.abs(Number(candidate.amount)))) {
			score += 3;
		}

		for (const row of batchRows) {
			if (namesAreSimilar(row.description, candidate.name)) {
				score += 2;
			}
			if (namesAreSimilar(row.sourceDescription, candidate.name)) {
				score += 1;
			}
		}

		return { candidate, score };
	});

	scored.sort((left, right) => {
		if (right.score !== left.score) {
			return right.score - left.score;
		}

		return left.candidate.name.localeCompare(right.candidate.name, "pt-BR");
	});

	const filtered = scored
		.filter((entry) => entry.score > 0)
		.slice(0, max)
		.map((entry) => entry.candidate);

	if (filtered.length > 0) {
		return filtered;
	}

	return allCandidates.slice(0, max);
}

export function parseImportAiBatchResponseText(text: string) {
	const trimmed = text.trim();
	const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

	try {
		const parsed = JSON.parse(candidate);
		return ImportAiBatchResponseSchema.safeParse(parsed);
	} catch {
		return ImportAiBatchResponseSchema.safeParse(null);
	}
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
		date: toDateOnlyString(snapshot.purchaseDate),
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

function buildCategoryCompatibilityChecker(
	entries: Array<{
		categoryId: string;
		transactionType: "income" | "expense";
		compatible: boolean;
	}>,
) {
	return (categoryId: string | null, transactionType: "income" | "expense") => {
		if (!categoryId) return true;
		const entry = entries.find(
			(item) =>
				item.categoryId === categoryId &&
				item.transactionType === transactionType,
		);
		return entry?.compatible ?? false;
	};
}

export function buildImportAiPatchesFromResults(input: {
	rows: ImportAiAnalysisRowInput[];
	categoryCompatibility: Array<{
		categoryId: string;
		transactionType: "income" | "expense";
		compatible: boolean;
	}>;
	aiResults: ImportAiRowResult[];
	existingSnapshots: (ImportDuplicateSnapshot & { period?: string | null })[];
}): ImportAiRowPatch[] {
	const existingById = new Map(
		input.existingSnapshots.map((snapshot) => [snapshot.id, snapshot] as const),
	);
	const isCategoryCompatible = buildCategoryCompatibilityChecker(
		input.categoryCompatibility,
	);

	return input.aiResults.flatMap((analysis) => {
		const row = input.rows.find((item) => item.rowIndex === analysis.rowIndex);
		if (!row) return [];

		const patch = buildImportAiRowPatch(
			{
				...row,
				installmentImport: row.installmentImport?.enabled
					? row.installmentImport
					: null,
			},
			analysis,
			existingById,
			{ isCategoryCompatible },
		);

		return patch ? [patch] : [];
	});
}

export function buildImportAiAnalysisStats(
	patches: ImportAiRowPatch[],
	rowsAnalyzed: number,
) {
	return {
		rowsAnalyzed,
		categoriesSuggested: patches.filter((patch) => patch.aiSuggestion.category)
			.length,
		duplicatesFound: patches.filter(
			(patch) => patch.aiSuggestion.duplicate && patch.isDuplicate,
		).length,
	};
}

export type ImportAiBatchJob = {
	analysisMode: ImportAiAnalysisMode;
	phaseBatchIndex: number;
	phaseTotalBatches: number;
	globalBatchIndex: number;
	globalTotalBatches: number;
	rows: ImportAiAnalysisRowInput[];
};

export function buildImportAiBatchJobs(
	partitioned: ImportAiPartitionedRows,
): ImportAiBatchJob[] {
	const categoryBatches = chunkImportAiRowsAdaptive(partitioned.categoryRows);
	const duplicateBatches = chunkImportAiRows(partitioned.duplicateRows);
	const globalTotalBatches = categoryBatches.length + duplicateBatches.length;
	const jobs: ImportAiBatchJob[] = [];

	for (const [index, rows] of categoryBatches.entries()) {
		jobs.push({
			analysisMode: "category",
			phaseBatchIndex: index,
			phaseTotalBatches: categoryBatches.length,
			globalBatchIndex: index,
			globalTotalBatches,
			rows,
		});
	}

	for (const [index, rows] of duplicateBatches.entries()) {
		jobs.push({
			analysisMode: "duplicate",
			phaseBatchIndex: index,
			phaseTotalBatches: duplicateBatches.length,
			globalBatchIndex: categoryBatches.length + index,
			globalTotalBatches,
			rows,
		});
	}

	return jobs;
}

export async function runTasksWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];

	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function runWorker() {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await worker(items[currentIndex], currentIndex);
		}
	}

	const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
		runWorker(),
	);
	await Promise.all(workers);
	return results;
}

export function buildImportAiRowEditSnapshots(
	rows: ReviewRow[],
): Map<number, ImportAiRowEditSnapshot> {
	return new Map(
		rows.map((row, index) => [
			index,
			{
				categoryId: row.categoryId,
				isDuplicate: row.isDuplicate,
			},
		]),
	);
}

function rowWasManuallyEdited(
	row: ReviewRow,
	snapshot: ImportAiRowEditSnapshot | undefined,
): boolean {
	if (!snapshot) return false;
	return (
		row.categoryId !== snapshot.categoryId ||
		row.isDuplicate !== snapshot.isDuplicate
	);
}

export function applyImportAiPatchesToRows(
	rows: ReviewRow[],
	patches: ImportAiRowPatch[],
	options?: {
		rowEditSnapshots?: Map<number, ImportAiRowEditSnapshot>;
	},
): ReviewRow[] {
	if (patches.length === 0) return rows;

	const patchByIndex = new Map(patches.map((patch) => [patch.rowIndex, patch]));

	return rows.map((row, index) => {
		const patch = patchByIndex.get(index);
		if (!patch) return row;

		if (row.linked || row.linkedTransactionId) {
			return row;
		}

		const snapshot = options?.rowEditSnapshots?.get(index);
		const manuallyEdited = rowWasManuallyEdited(row, snapshot);

		if (manuallyEdited) {
			return {
				...row,
				aiSuggestion: {
					...row.aiSuggestion,
					...patch.aiSuggestion,
				},
			};
		}

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

export function mergeImportAiAnalysisStats(
	current: {
		categoriesSuggested: number;
		duplicatesFound: number;
		rowsAnalyzed: number;
	},
	patchBatch: ImportAiRowPatch[],
	rowsAnalyzedDelta: number,
) {
	const batchStats = buildImportAiAnalysisStats(patchBatch, rowsAnalyzedDelta);
	return {
		categoriesSuggested:
			current.categoriesSuggested + batchStats.categoriesSuggested,
		duplicatesFound: current.duplicatesFound + batchStats.duplicatesFound,
		rowsAnalyzed: current.rowsAnalyzed + batchStats.rowsAnalyzed,
	};
}

export function buildImportAiAnalysisPayload(input: {
	modelId?: string | null;
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
	const selectedRows = input.rows
		.map((row, rowIndex) => ({ row, rowIndex }))
		.filter(({ row }) => row.selected && !isInvoiceExtraReviewRow(row));

	return {
		modelId: input.modelId?.trim() || undefined,
		isCreditCard: input.isCreditCard,
		cardId: input.cardId,
		invoicePeriods: input.invoicePeriods,
		accountId: input.accountId,
		statementPeriod: input.statementPeriod,
		cardName: input.cardName,
		accountName: input.accountName,
		categories: input.categories,
		categoryCompatibility: input.categoryCompatibility,
		rows: selectedRows.map(({ row, rowIndex }) => ({
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
		})) as ImportAiAnalysisRowInput[],
	};
}
