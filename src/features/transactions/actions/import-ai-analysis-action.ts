"use server";

import { generateObject } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { transactions } from "@/db/schema";
import { resolveInsightsModel } from "@/features/insights/lib/model-provider";
import {
	fetchAccountImportDuplicateSnapshots,
	fetchCardInstallmentDuplicateSnapshots,
	fetchInvoicePeriodDuplicateSnapshots,
} from "@/features/transactions/actions/import-action";
import {
	buildImportAiBatchPrompt,
	buildImportAiRowPatch,
	chunkImportAiRows,
	IMPORT_AI_SYSTEM_PROMPT,
	type ImportAiAnalysisRowInput,
	ImportAiBatchResponseSchema,
	type ImportAiRowPatch,
	type ImportAiRowResult,
	mapExistingSnapshotToAiCandidate,
} from "@/features/transactions/lib/import-ai-analysis";
import {
	type ImportDuplicateSnapshot,
	mergeImportDuplicateSnapshots,
} from "@/features/transactions/lib/import-duplicate-match";
import { formatAiActionError } from "@/shared/lib/ai/format-ai-action-error";
import { resolveAiModelIdForCredentials } from "@/shared/lib/ai/model-config-helpers";
import { AI_STORED_KEY_UNREADABLE_MESSAGE } from "@/shared/lib/ai/provider-messages";
import {
	fetchUserAiProviderSettings,
	hasInvalidStoredAiKeys,
	isAnyAiProviderConfigured,
} from "@/shared/lib/ai/user-provider-config";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

const installmentImportSchema = z
	.object({
		enabled: z.boolean(),
		name: z.string(),
		currentInstallment: z.number().int().min(1).max(60),
		installmentCount: z.number().int().min(2).max(60),
	})
	.nullable();

const analyzeImportInputSchema = z.object({
	modelId: z.string().trim().min(1).optional(),
	isCreditCard: z.boolean(),
	cardId: z.string().uuid().nullable(),
	invoicePeriods: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
	accountId: z.string().uuid().nullable(),
	statementPeriod: z
		.object({
			from: z.string(),
			to: z.string(),
		})
		.nullable(),
	cardName: z.string().nullable(),
	accountName: z.string().nullable(),
	rows: z.array(
		z.object({
			rowIndex: z.number().int().min(0),
			description: z.string(),
			sourceDescription: z.string(),
			amount: z.number(),
			date: z.string(),
			transactionType: z.enum(["income", "expense"]),
			kind: z.enum(["transaction", "invoice_payment", "transfer"]),
			installment: z
				.object({
					name: z.string(),
					currentInstallment: z.number().int().min(1).max(60),
					installmentCount: z.number().int().min(2).max(60),
				})
				.nullable(),
			installmentImport: installmentImportSchema,
			algorithmDuplicate: z.object({
				isDuplicate: z.boolean(),
				status: z.enum(["match", "mismatch", "link_suggestion"]).nullable(),
				existingTransactionId: z.string().uuid().nullable(),
			}),
			currentCategoryId: z.string().uuid().nullable(),
			isDuplicate: z.boolean(),
			selected: z.boolean(),
			linked: z.boolean().optional(),
			reimported: z.boolean().optional(),
		}),
	),
	categories: z.array(
		z.object({
			id: z.string().uuid(),
			name: z.string(),
			transactionType: z.enum(["income", "expense"]),
		}),
	),
	categoryCompatibility: z.array(
		z.object({
			categoryId: z.string().uuid(),
			transactionType: z.enum(["income", "expense"]),
			compatible: z.boolean(),
		}),
	),
});

export type AnalyzeImportWithAiInput = z.infer<typeof analyzeImportInputSchema>;

export type AnalyzeImportWithAiResult =
	| {
			success: true;
			skipped: false;
			data: {
				patches: ImportAiRowPatch[];
				stats: {
					categoriesSuggested: number;
					duplicatesFound: number;
					rowsAnalyzed: number;
				};
				modelId: string;
			};
	  }
	| {
			success: true;
			skipped: true;
			reason: "no_provider" | "no_rows";
	  }
	| {
			success: false;
			error: string;
	  };

export async function fetchExistingCandidatesForAi(input: {
	userId: string;
	isCreditCard: boolean;
	cardId: string | null;
	invoicePeriods: string[];
	accountId: string | null;
	statementPeriod: { from: string; to: string } | null;
}): Promise<(ImportDuplicateSnapshot & { period?: string | null })[]> {
	if (input.isCreditCard && input.cardId) {
		const invoiceSnapshots = await Promise.all(
			input.invoicePeriods.map((period) =>
				fetchInvoicePeriodDuplicateSnapshots(input.cardId as string, period),
			),
		);
		const installmentSnapshots = await fetchCardInstallmentDuplicateSnapshots(
			input.cardId,
		);

		const merged = mergeImportDuplicateSnapshots(
			...invoiceSnapshots,
			installmentSnapshots,
		);

		if (merged.length === 0) return merged;

		const periods = await db
			.select({
				id: transactions.id,
				period: transactions.period,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, input.userId),
					inArray(
						transactions.id,
						merged.map((snapshot) => snapshot.id),
					),
				),
			);

		const periodById = new Map(
			periods.map((row) => [row.id, row.period] as const),
		);

		return merged.map((snapshot) => ({
			...snapshot,
			period: periodById.get(snapshot.id) ?? null,
		}));
	}

	if (input.accountId && input.statementPeriod) {
		return fetchAccountImportDuplicateSnapshots(
			input.accountId,
			input.statementPeriod.from,
			input.statementPeriod.to,
		);
	}

	return [];
}

function compactExistingCandidates(
	candidates: ReturnType<typeof mapExistingSnapshotToAiCandidate>[],
	max = 250,
) {
	return candidates.slice(0, max);
}

function buildCategoryCompatibilityMap(
	entries: AnalyzeImportWithAiInput["categoryCompatibility"],
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

export async function analyzeImportWithAiAction(
	rawInput: AnalyzeImportWithAiInput,
): Promise<AnalyzeImportWithAiResult> {
	try {
		const input = analyzeImportInputSchema.parse(rawInput);
		const userId = await getUserId();

		if (input.rows.length === 0) {
			return { success: true, skipped: true, reason: "no_rows" };
		}

		const { credentials, insightsDefaultModelId, storedSettings } =
			await fetchUserAiProviderSettings(userId);

		if (hasInvalidStoredAiKeys(storedSettings)) {
			return {
				success: false,
				error: AI_STORED_KEY_UNREADABLE_MESSAGE,
			};
		}

		if (!isAnyAiProviderConfigured(credentials)) {
			return { success: true, skipped: true, reason: "no_provider" };
		}

		const modelId = resolveAiModelIdForCredentials(credentials, {
			explicitModelId: input.modelId,
			insightsDefaultModelId,
			storedSettings,
		});
		const resolvedModel = resolveInsightsModel(modelId, credentials);
		if (!resolvedModel.success) {
			return { success: false, error: resolvedModel.error };
		}

		const existingSnapshots = await fetchExistingCandidatesForAi({
			userId,
			isCreditCard: input.isCreditCard,
			cardId: input.cardId,
			invoicePeriods: input.invoicePeriods,
			accountId: input.accountId,
			statementPeriod: input.statementPeriod,
		});

		const existingById = new Map(
			existingSnapshots.map((snapshot) => [snapshot.id, snapshot] as const),
		);

		const existingCandidates = compactExistingCandidates(
			existingSnapshots.map(mapExistingSnapshotToAiCandidate),
		);

		const rowBatches = chunkImportAiRows(input.rows);
		const aiResults: ImportAiRowResult[] = [];

		for (const [batchIndex, batchRows] of rowBatches.entries()) {
			const result = await generateObject({
				model: resolvedModel.model,
				schema: ImportAiBatchResponseSchema,
				system: IMPORT_AI_SYSTEM_PROMPT,
				prompt: buildImportAiBatchPrompt({
					context: {
						isCreditCard: input.isCreditCard,
						invoicePeriod: input.invoicePeriods[0] ?? null,
						cardName: input.cardName,
						accountName: input.accountName,
					},
					categories: input.categories,
					existingCandidates,
					rows: batchRows as ImportAiAnalysisRowInput[],
					batchIndex,
					totalBatches: rowBatches.length,
				}),
			});

			const validated = ImportAiBatchResponseSchema.parse(result.object);
			aiResults.push(...validated.rows);
		}

		const isCategoryCompatible = buildCategoryCompatibilityMap(
			input.categoryCompatibility,
		);

		const patches = aiResults.flatMap((analysis) => {
			const row = input.rows[analysis.rowIndex];
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

		const stats = {
			rowsAnalyzed: aiResults.length,
			categoriesSuggested: patches.filter(
				(patch) => patch.aiSuggestion.category,
			).length,
			duplicatesFound: patches.filter(
				(patch) => patch.aiSuggestion.duplicate && patch.isDuplicate,
			).length,
		};

		return {
			success: true,
			skipped: false,
			data: {
				patches,
				stats,
				modelId,
			},
		};
	} catch (error) {
		console.error("Erro na análise de importação com IA:", error);
		return {
			success: false,
			error: formatAiActionError(error, "import"),
		};
	}
}
