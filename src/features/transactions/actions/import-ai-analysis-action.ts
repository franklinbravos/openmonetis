"use server";

import { generateObject, generateText, type LanguageModel } from "ai";
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
	buildImportAiAnalysisStats,
	buildImportAiBatchPrompt,
	buildImportAiPatchesFromResults,
	chunkImportAiRows,
	filterExistingCandidatesForBatch,
	IMPORT_AI_SYSTEM_PROMPT,
	type ImportAiAnalysisRowInput,
	ImportAiBatchResponseSchema,
	type ImportAiExistingCandidate,
	type ImportAiRowPatch,
	type ImportAiRowResult,
	mapExistingSnapshotToAiCandidate,
	parseImportAiBatchResponseText,
} from "@/features/transactions/lib/import-ai-analysis";
import {
	type ImportDuplicateSnapshot,
	mergeImportDuplicateSnapshots,
} from "@/features/transactions/lib/import-duplicate-match";
import {
	formatAiActionError,
	serializeAiActionErrorLog,
} from "@/shared/lib/ai/format-ai-action-error";
import {
	getModelLabel,
	getProviderFromModelId,
	resolveAiModelIdForCredentials,
} from "@/shared/lib/ai/model-config-helpers";
import { getOpenCodePlanFromBaseUrl } from "@/shared/lib/ai/opencode-plans";
import { AI_STORED_KEY_UNREADABLE_MESSAGE } from "@/shared/lib/ai/provider-messages";
import type { ResolvedAiCredentials } from "@/shared/lib/ai/types";
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
			errorLog: string;
	  };

export type PrepareImportAiAnalysisResult =
	| {
			success: true;
			skipped: false;
			data: {
				modelId: string;
				modelLabel: string;
				batchCount: number;
				rowCount: number;
				candidateCount: number;
				existingCandidates: ImportAiExistingCandidate[];
				existingSnapshots: (ImportDuplicateSnapshot & {
					period?: string | null;
				})[];
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
			errorLog: string;
	  };

export type AnalyzeImportAiBatchResult =
	| {
			success: true;
			data: {
				rows: ImportAiRowResult[];
			};
	  }
	| {
			success: false;
			error: string;
			errorLog: string;
	  };

const analyzeImportAiBatchInputSchema = analyzeImportInputSchema.extend({
	batchIndex: z.number().int().min(0),
	totalBatches: z.number().int().min(1),
	existingCandidates: z.array(
		z.object({
			id: z.string().uuid(),
			name: z.string(),
			amount: z.number(),
			date: z.string().nullable(),
			period: z.string().nullable(),
			installment: z.string().nullable(),
			categoryId: z.string().uuid().nullable(),
		}),
	),
});

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

async function resolveImportAiExecutionContext(
	input: AnalyzeImportWithAiInput,
	options?: { fetchCandidates?: boolean },
) {
	const userId = await getUserId();
	const { credentials, insightsDefaultModelId, storedSettings } =
		await fetchUserAiProviderSettings(userId);

	if (hasInvalidStoredAiKeys(storedSettings)) {
		return {
			success: false as const,
			result: buildImportAiFailureResult(
				new Error(AI_STORED_KEY_UNREADABLE_MESSAGE),
				{ modelLabel: null },
			),
		};
	}

	if (!isAnyAiProviderConfigured(credentials)) {
		return {
			success: false as const,
			result: {
				success: true as const,
				skipped: true as const,
				reason: "no_provider" as const,
			},
		};
	}

	const modelId = resolveAiModelIdForCredentials(credentials, {
		explicitModelId: input.modelId,
		insightsDefaultModelId,
		storedSettings,
	});
	const modelLabel = buildImportAiModelLabel(modelId, credentials);

	const resolvedModel = resolveInsightsModel(modelId, credentials);
	if (!resolvedModel.success) {
		return {
			success: false as const,
			result: buildImportAiFailureResult(new Error(resolvedModel.error), {
				modelId,
				modelLabel,
				credentials,
				rowCount: input.rows.length,
			}),
		};
	}

	const existingSnapshots = options?.fetchCandidates
		? await fetchExistingCandidatesForAi({
				userId,
				isCreditCard: input.isCreditCard,
				cardId: input.cardId,
				invoicePeriods: input.invoicePeriods,
				accountId: input.accountId,
				statementPeriod: input.statementPeriod,
			})
		: [];

	const existingCandidates = options?.fetchCandidates
		? compactExistingCandidates(
				existingSnapshots.map(mapExistingSnapshotToAiCandidate),
			)
		: [];

	return {
		success: true as const,
		context: {
			userId,
			credentials,
			modelId,
			modelLabel,
			resolvedModel,
			existingSnapshots,
			existingCandidates,
		},
	};
}

function buildImportAiModelLabel(
	modelId: string,
	credentials: ResolvedAiCredentials,
): string {
	const provider = getProviderFromModelId(modelId);
	const baseLabel = getModelLabel(modelId);

	if (provider !== "opencode") {
		return baseLabel;
	}

	const planLabel =
		getOpenCodePlanFromBaseUrl(credentials.opencode.baseUrl) === "go"
			? "OpenCode Go"
			: "OpenCode Zen";

	return `${baseLabel} (${planLabel})`;
}

function buildImportAiErrorContext(input: {
	modelId?: string | null;
	modelLabel?: string | null;
	credentials?: ResolvedAiCredentials;
	rowCount?: number;
	batchCount?: number;
	batchIndex?: number;
}) {
	const provider = input.modelId ? getProviderFromModelId(input.modelId) : null;

	return {
		modelId: input.modelId ?? null,
		modelLabel: input.modelLabel ?? null,
		provider,
		opencodePlan:
			provider === "opencode" && input.credentials
				? getOpenCodePlanFromBaseUrl(input.credentials.opencode.baseUrl)
				: null,
		opencodeBaseUrl:
			provider === "opencode" && input.credentials
				? (input.credentials.opencode.baseUrl ?? null)
				: null,
		rowCount: input.rowCount ?? null,
		batchCount: input.batchCount ?? null,
		batchIndex: input.batchIndex ?? null,
	};
}

function buildImportAiFailureResult(
	error: unknown,
	options: {
		modelId?: string | null;
		modelLabel?: string | null;
		credentials?: ResolvedAiCredentials;
		rowCount?: number;
		batchCount?: number;
		batchIndex?: number;
	},
) {
	const context = buildImportAiErrorContext(options);

	return {
		success: false as const,
		error: formatAiActionError(error, "import", {
			modelLabel: options.modelLabel,
		}),
		errorLog: serializeAiActionErrorLog(error, context),
	};
}

async function generateImportAiBatchResult(input: {
	model: LanguageModel;
	promptPayload: Parameters<typeof buildImportAiBatchPrompt>[0];
}) {
	const prompt = buildImportAiBatchPrompt(input.promptPayload);

	try {
		const result = await generateObject({
			model: input.model,
			schema: ImportAiBatchResponseSchema,
			system: IMPORT_AI_SYSTEM_PROMPT,
			prompt,
			maxRetries: 1,
		});

		return ImportAiBatchResponseSchema.parse(result.object);
	} catch (objectError) {
		console.warn(
			`generateObject falhou no lote ${input.promptPayload.batchIndex + 1}/${input.promptPayload.totalBatches}, tentando generateText:`,
			objectError,
		);

		const textResult = await generateText({
			model: input.model,
			system: `${IMPORT_AI_SYSTEM_PROMPT}

Retorne APENAS um JSON válido, sem markdown, no formato {"rows":[...]}.`,
			prompt,
			maxRetries: 1,
		});

		const parsed = parseImportAiBatchResponseText(textResult.text);
		if (!parsed.success) {
			throw objectError;
		}

		return parsed.data;
	}
}

export async function prepareImportAiAnalysisAction(
	rawInput: AnalyzeImportWithAiInput,
): Promise<PrepareImportAiAnalysisResult> {
	try {
		const input = analyzeImportInputSchema.parse(rawInput);

		if (input.rows.length === 0) {
			return { success: true, skipped: true, reason: "no_rows" };
		}

		const resolved = await resolveImportAiExecutionContext(input, {
			fetchCandidates: true,
		});
		if (!resolved.success) {
			return resolved.result;
		}

		const { modelId, modelLabel, existingCandidates, existingSnapshots } =
			resolved.context;
		const batchCount = chunkImportAiRows(input.rows).length;

		console.info("Preparando análise de importação com IA", {
			modelId,
			modelLabel,
			rowCount: input.rows.length,
			batchCount,
			candidateCount: existingCandidates.length,
		});

		return {
			success: true,
			skipped: false,
			data: {
				modelId,
				modelLabel,
				batchCount,
				rowCount: input.rows.length,
				candidateCount: existingCandidates.length,
				existingCandidates,
				existingSnapshots,
			},
		};
	} catch (error) {
		console.error("Erro ao preparar análise de importação com IA:", error);
		return buildImportAiFailureResult(error, { modelLabel: null });
	}
}

export async function analyzeImportAiBatchAction(
	rawInput: z.infer<typeof analyzeImportAiBatchInputSchema>,
): Promise<AnalyzeImportAiBatchResult> {
	let modelLabel: string | null = null;

	try {
		const input = analyzeImportAiBatchInputSchema.parse(rawInput);
		const resolved = await resolveImportAiExecutionContext(input, {
			fetchCandidates: false,
		});
		if (!resolved.success) {
			if ("skipped" in resolved.result) {
				return buildImportAiFailureResult(
					new Error("Provedor de IA não configurado."),
					{ modelLabel },
				);
			}

			return resolved.result;
		}

		const {
			modelId,
			modelLabel: resolvedModelLabel,
			resolvedModel,
		} = resolved.context;
		modelLabel = resolvedModelLabel;

		if (input.modelId && input.modelId !== modelId) {
			return buildImportAiFailureResult(
				new Error("Modelo de IA alterado durante a análise. Tente novamente."),
				{
					modelId,
					modelLabel,
					rowCount: input.rows.length,
					batchCount: input.totalBatches,
					batchIndex: input.batchIndex + 1,
				},
			);
		}

		const batchCandidates = filterExistingCandidatesForBatch(
			input.rows as ImportAiAnalysisRowInput[],
			input.existingCandidates,
		);

		const validated = await generateImportAiBatchResult({
			model: resolvedModel.model,
			promptPayload: {
				context: {
					isCreditCard: input.isCreditCard,
					invoicePeriod: input.invoicePeriods[0] ?? null,
					cardName: input.cardName,
					accountName: input.accountName,
				},
				categories: input.categories,
				existingCandidates: batchCandidates,
				rows: input.rows as ImportAiAnalysisRowInput[],
				batchIndex: input.batchIndex,
				totalBatches: input.totalBatches,
			},
		});

		return {
			success: true,
			data: {
				rows: validated.rows,
			},
		};
	} catch (error) {
		console.error("Erro no lote da análise de importação com IA:", error);
		return buildImportAiFailureResult(error, {
			modelLabel,
			batchIndex:
				typeof rawInput === "object" &&
				rawInput &&
				"batchIndex" in rawInput &&
				typeof rawInput.batchIndex === "number"
					? rawInput.batchIndex + 1
					: undefined,
			batchCount:
				typeof rawInput === "object" &&
				rawInput &&
				"totalBatches" in rawInput &&
				typeof rawInput.totalBatches === "number"
					? rawInput.totalBatches
					: undefined,
		});
	}
}

export async function analyzeImportWithAiAction(
	rawInput: AnalyzeImportWithAiInput,
): Promise<AnalyzeImportWithAiResult> {
	try {
		const input = analyzeImportInputSchema.parse(rawInput);
		const prepared = await prepareImportAiAnalysisAction(input);

		if (!prepared.success) {
			return prepared;
		}

		if (prepared.skipped) {
			return prepared;
		}

		const rowBatches = chunkImportAiRows(input.rows);
		const aiResults: ImportAiRowResult[] = [];

		for (const [batchIndex, batchRows] of rowBatches.entries()) {
			const batchResult = await analyzeImportAiBatchAction({
				...input,
				rows: batchRows,
				batchIndex,
				totalBatches: rowBatches.length,
				existingCandidates: prepared.data.existingCandidates,
			});

			if (!batchResult.success) {
				return batchResult;
			}

			aiResults.push(...batchResult.data.rows);
		}

		const patches = buildImportAiPatchesFromResults({
			rows: input.rows as ImportAiAnalysisRowInput[],
			categoryCompatibility: input.categoryCompatibility,
			aiResults,
			existingSnapshots: prepared.data.existingSnapshots,
		});

		return {
			success: true,
			skipped: false,
			data: {
				patches,
				stats: buildImportAiAnalysisStats(patches, aiResults.length),
				modelId: prepared.data.modelId,
			},
		};
	} catch (error) {
		console.error("Erro na análise de importação com IA:", error);
		return buildImportAiFailureResult(error, { modelLabel: null });
	}
}
