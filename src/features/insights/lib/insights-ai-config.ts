import {
	type AIProvider,
	DEFAULT_MODEL,
	PROVIDERS,
} from "@/features/insights/constants";
import { getModelLabel, getProviderFromModelId } from "@/shared/lib/ai/model-config-helpers";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";

export function getInsightsAiConfigState(
	selectedModelId: string,
	providerSettings?: AiProviderSettingsView["providers"],
) {
	const currentProvider =
		(getProviderFromModelId(selectedModelId) as AIProvider | null) ?? "openai";
	const selectedModelLabel = getModelLabel(selectedModelId) || DEFAULT_MODEL;
	const providerConfig = providerSettings?.[currentProvider];
	const hasInvalidKey = providerConfig?.hasInvalidDatabaseKey ?? false;
	const hasCredential =
		providerConfig?.activeSource !== "none" && !hasInvalidKey;
	const isConfigured = currentProvider === "ollama" || hasCredential;

	return {
		currentProvider,
		selectedModelLabel,
		hasInvalidKey,
		hasCredential,
		isConfigured,
		providerName: PROVIDERS[currentProvider].name,
	};
}
