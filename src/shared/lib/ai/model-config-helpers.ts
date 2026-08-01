import {
	type AIProvider,
	AVAILABLE_MODELS,
	CUSTOM_MODEL_PROVIDERS,
	type CustomModelProvider,
} from "@/features/insights/constants";
import type { ListedProviderModel } from "./list-provider-models";

export function isCustomModelProvider(
	provider: AIProvider,
): provider is CustomModelProvider {
	return CUSTOM_MODEL_PROVIDERS.includes(provider as CustomModelProvider);
}

export function getProviderFromModelId(modelId: string): AIProvider | null {
	if (modelId.startsWith("openrouter:")) {
		return "openrouter";
	}

	if (modelId.startsWith("opencode:")) {
		return "opencode";
	}

	if (modelId.startsWith("ollama:")) {
		return "ollama";
	}

	if (modelId.includes("/")) {
		return "openrouter";
	}

	return (
		AVAILABLE_MODELS.find((model) => model.id === modelId)?.provider ?? null
	);
}

export function stripCustomProviderPrefix(value: string, provider: AIProvider) {
	if (!isCustomModelProvider(provider)) {
		return value;
	}

	return value.startsWith(`${provider}:`)
		? value.slice(`${provider}:`.length)
		: value;
}

export function getModelLabel(
	modelId: string,
	models: ListedProviderModel[] = [],
): string {
	const listedModel = models.find((model) => model.id === modelId);
	if (listedModel) {
		return listedModel.name;
	}

	const staticModel = AVAILABLE_MODELS.find((model) => model.id === modelId);
	if (staticModel) {
		return staticModel.name;
	}

	const provider = getProviderFromModelId(modelId);
	return provider ? stripCustomProviderPrefix(modelId, provider) : modelId;
}
