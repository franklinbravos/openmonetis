"use server";

import { z } from "zod";
import { listProviderModels } from "@/shared/lib/ai/list-provider-models";
import { AI_STORED_KEY_UNREADABLE_MESSAGE } from "@/shared/lib/ai/provider-messages";
import { resolveRuntimeProviderCredential } from "@/shared/lib/ai/resolve-runtime-ai-credentials";
import {
	fetchInstanceAiProviderSettings,
	hasInvalidStoredAiKeyForProvider,
} from "@/shared/lib/ai/user-provider-config";
import { getUser } from "@/shared/lib/auth/server";
import type { ActionResult } from "./types";

const fetchProviderModelsSchema = z.object({
	provider: z.enum([
		"openai",
		"anthropic",
		"google",
		"minimax",
		"openrouter",
		"opencode",
		"ollama",
	]),
	apiKey: z.string().optional(),
	baseUrl: z.string().optional(),
});

export async function fetchProviderModelsAction(
	input: z.infer<typeof fetchProviderModelsSchema>,
): Promise<
	ActionResult<{
		models: Array<{ id: string; name: string }>;
	}>
> {
	try {
		const user = await getUser();
		const data = fetchProviderModelsSchema.parse(input);
		const { storedSettings } = await fetchInstanceAiProviderSettings(user.id);
		const usingFreshApiKey = Boolean(data.apiKey?.trim());
		const providerListsWithoutKey =
			data.provider === "opencode" || data.provider === "ollama";

		if (
			!usingFreshApiKey &&
			!providerListsWithoutKey &&
			hasInvalidStoredAiKeyForProvider(storedSettings, data.provider)
		) {
			return {
				success: false,
				error: AI_STORED_KEY_UNREADABLE_MESSAGE,
			};
		}

		const storedCredential = resolveRuntimeProviderCredential(
			data.provider,
			storedSettings,
			{
				apiKey: data.apiKey,
				baseUrl: data.baseUrl,
			},
		);

		const result = await listProviderModels({
			provider: data.provider,
			apiKey: storedCredential.apiKey,
			baseUrl: storedCredential.baseUrl,
		});

		if (!result.success) {
			return result;
		}

		return {
			success: true,
			data: {
				models: result.models,
			},
		};
	} catch (error) {
		console.error("Error fetching provider models:", error);
		return {
			success: false,
			error: "Erro ao listar modelos do provedor.",
		};
	}
}
