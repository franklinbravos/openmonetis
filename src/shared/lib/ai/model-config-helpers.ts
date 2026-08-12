import {
	type AIProvider,
	AVAILABLE_MODELS,
	CUSTOM_MODEL_PROVIDERS,
	type CustomModelProvider,
	DEFAULT_MODEL,
	PROVIDERS,
} from "@/features/insights/constants";
import type { ListedProviderModel } from "./list-provider-models";
import type { ResolvedAiCredentials, StoredAiProviderSettings } from "./types";

const AI_PROVIDER_IDS = Object.keys(PROVIDERS) as AIProvider[];

function modelHasUsableCredential(
	modelId: string,
	credentials: ResolvedAiCredentials,
): boolean {
	const provider = getProviderFromModelId(modelId);
	if (!provider) return false;

	const credential = credentials[provider];
	return Boolean(credential?.apiKey) || provider === "ollama";
}

function buildStoredProviderModelId(
	provider: AIProvider,
	storedModelId: string,
): string {
	if (isCustomModelProvider(provider)) {
		return storedModelId.startsWith(`${provider}:`)
			? storedModelId
			: `${provider}:${storedModelId}`;
	}

	return storedModelId;
}

/** Escolhe um modelId cujo provedor tenha credencial utilizável no banco. */
export function resolveAiModelIdForCredentials(
	credentials: ResolvedAiCredentials,
	options: {
		insightsDefaultModelId?: string | null;
		explicitModelId?: string | null;
		storedSettings?: StoredAiProviderSettings | null;
	},
): string {
	const candidates = [
		options.explicitModelId?.trim(),
		options.insightsDefaultModelId?.trim(),
	].filter(Boolean) as string[];

	for (const modelId of candidates) {
		if (modelHasUsableCredential(modelId, credentials)) {
			return modelId;
		}
	}

	for (const provider of AI_PROVIDER_IDS) {
		const storedModelId = options.storedSettings?.[provider]?.defaultModelId;
		if (!storedModelId) continue;

		const modelId = buildStoredProviderModelId(provider, storedModelId);
		if (modelHasUsableCredential(modelId, credentials)) {
			return modelId;
		}
	}

	for (const provider of AI_PROVIDER_IDS) {
		if (!credentials[provider]?.apiKey && provider !== "ollama") continue;

		const staticModel = AVAILABLE_MODELS.find(
			(model) => model.provider === provider,
		);
		if (staticModel && modelHasUsableCredential(staticModel.id, credentials)) {
			return staticModel.id;
		}
	}

	return options.insightsDefaultModelId?.trim() || DEFAULT_MODEL;
}

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
