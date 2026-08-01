"use server";

import { z } from "zod";
import { listProviderModels } from "@/shared/lib/ai/list-provider-models";
import { fetchUserAiProviderSettings } from "@/shared/lib/ai/user-provider-config";
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
		const { credentials } = await fetchUserAiProviderSettings(user.id);
		const storedCredential = credentials[data.provider];

		const result = await listProviderModels({
			provider: data.provider,
			apiKey: data.apiKey?.trim() || storedCredential.apiKey,
			baseUrl: data.baseUrl?.trim() || storedCredential.baseUrl,
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
