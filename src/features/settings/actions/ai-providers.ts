"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AIProvider } from "@/features/insights/constants";
import { encryptSecret } from "@/shared/lib/ai/secret-encryption";
import type { StoredAiFallbackSettings } from "@/shared/lib/ai/types";
import {
	fetchInstanceAiProviderSettings,
	mergeStoredProviderSettings,
} from "@/shared/lib/ai/user-provider-config";
import { getUser } from "@/shared/lib/auth/server";
import { db, schema } from "@/shared/lib/db";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";

type ActionResponse<T = void> = {
	success: boolean;
	message?: string;
	error?: string;
	data?: T;
};

const providerUpdateSchema = z.object({
	apiKey: z.string().optional(),
	clearApiKey: z.boolean().optional(),
	baseUrl: z.string().nullable().optional(),
	defaultModelId: z.string().nullable().optional(),
});

const aiProviderEnum = z.enum([
	"openai",
	"anthropic",
	"google",
	"minimax",
	"openrouter",
	"opencode",
	"ollama",
]);

/** Postgres: coluna inexistente. */
function isUndefinedColumnError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const record = error as { code?: string; cause?: { code?: string } };
	return record.code === "42703" || record.cause?.code === "42703";
}

const updateAiProviderSettingsSchema = z.object({
	insightsDefaultModelId: z.string().trim().min(1).nullable().optional(),
	/** Reserva da análise: modelo, chave própria opcional e habilitação. */
	fallback: z
		.object({
			enabled: z.boolean(),
			modelId: z.string().trim().min(1).nullable(),
			/** Ausente mantém a chave salva; string vazia não é aceita. */
			apiKey: z.string().trim().min(1).optional(),
			baseUrl: z.string().trim().min(1).nullable().optional(),
		})
		.optional(),
	providers: z.partialRecord(aiProviderEnum, providerUpdateSchema).optional(),
});

export async function updateAiProviderSettingsAction(
	input: z.infer<typeof updateAiProviderSettingsSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const validated = updateAiProviderSettingsSchema.parse(input);

		const existingResult = await db
			.select({
				id: schema.userPreferences.id,
				aiProviderSettings: schema.userPreferences.aiProviderSettings,
				aiFallbackSettings: schema.userPreferences.aiFallbackSettings,
			})
			.from(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, dataOwnerUserId))
			.limit(1);

		const existing = existingResult[0] ?? null;
		let nextSettings = existing?.aiProviderSettings ?? {};

		if (validated.providers) {
			for (const [providerId, providerUpdates] of Object.entries(
				validated.providers,
			)) {
				if (!providerUpdates) continue;
				nextSettings = mergeStoredProviderSettings(
					nextSettings,
					providerId as AIProvider,
					providerUpdates,
				);
			}
		}

		const preferencesPayload: {
			insightsDefaultModelId?: string | null;
			aiFallbackSettings?: StoredAiFallbackSettings;
			aiProviderSettings?: typeof nextSettings;
			updatedAt: Date;
		} = {
			updatedAt: new Date(),
		};

		if (validated.insightsDefaultModelId !== undefined) {
			preferencesPayload.insightsDefaultModelId =
				validated.insightsDefaultModelId;
		}

		if (validated.fallback) {
			const previous = existing?.aiFallbackSettings ?? null;
			// Chave em branco mantém a que já está salva — a tela nunca a recebe de volta.
			const encryptedApiKey = validated.fallback.apiKey
				? encryptSecret(validated.fallback.apiKey)
				: (previous?.encryptedApiKey ?? null);

			preferencesPayload.aiFallbackSettings = {
				enabled: validated.fallback.enabled,
				modelId: validated.fallback.modelId,
				encryptedApiKey,
				baseUrl:
					validated.fallback.baseUrl !== undefined
						? validated.fallback.baseUrl
						: (previous?.baseUrl ?? null),
			};
		}

		if (validated.providers) {
			preferencesPayload.aiProviderSettings = nextSettings;
		}

		if (existing) {
			await db
				.update(schema.userPreferences)
				.set(preferencesPayload)
				.where(eq(schema.userPreferences.userId, dataOwnerUserId));
		} else {
			await db.insert(schema.userPreferences).values({
				userId: dataOwnerUserId,
				...preferencesPayload,
			});
		}

		revalidatePath("/settings");
		revalidatePath("/insights");

		return {
			success: true,
			message: "Configurações de IA salvas com sucesso.",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		// Coluna do modelo de reserva ainda não migrada nesta instância.
		if (isUndefinedColumnError(error)) {
			console.error("Coluna ausente ao salvar configurações de IA:", error);
			return {
				success: false,
				error:
					"O banco desta instância ainda não tem a coluna da reserva de IA. Rode as migrations e tente novamente.",
			};
		}

		console.error("Erro ao salvar configurações de IA:", error);
		return {
			success: false,
			error: "Erro ao salvar configurações de IA. Tente novamente.",
		};
	}
}

export async function fetchAiProviderSettingsAction() {
	const user = await getUser();
	const settings = await fetchInstanceAiProviderSettings(user.id);
	return settings.view;
}
