import type { AIProvider } from "@/features/insights/constants";
import type { ListedProviderModel } from "./list-provider-models";
import {
	getProviderFromModelId,
	isCustomModelProvider,
	stripCustomProviderPrefix,
} from "./model-config-helpers";

function buildFallbackListedModel(
	modelId: string,
	options?: { unavailableInCatalog?: boolean; source?: "saved" | "selected" },
): ListedProviderModel | null {
	const provider = getProviderFromModelId(modelId);
	if (!provider || !modelId.trim()) {
		return null;
	}

	return {
		id: modelId,
		name: stripCustomProviderPrefix(modelId, provider),
		unavailableInCatalog: options?.unavailableInCatalog,
		metadata: options?.source ? { source: options.source } : undefined,
	};
}

/** Mantém o modelo selecionado/salvo visível mesmo fora do catálogo recém-carregado. */
export function mergeListedProviderModels(
	fetchedModels: ListedProviderModel[],
	options: {
		selectedModelId: string;
		savedModelId?: string | null;
		currentProvider: AIProvider;
	},
): ListedProviderModel[] {
	const merged = [...fetchedModels];
	const seen = new Set(merged.map((model) => model.id));

	const injectModel = (
		modelId: string | null | undefined,
		injection: {
			unavailableInCatalog?: boolean;
			source?: "saved" | "selected";
		},
	) => {
		if (!modelId || seen.has(modelId)) return;
		if (getProviderFromModelId(modelId) !== options.currentProvider) return;

		const fallback = buildFallbackListedModel(modelId, injection);
		if (!fallback) return;

		merged.unshift(fallback);
		seen.add(modelId);
	};

	const selectedInCatalog = fetchedModels.some(
		(model) => model.id === options.selectedModelId,
	);
	if (!selectedInCatalog) {
		injectModel(options.selectedModelId, {
			unavailableInCatalog: true,
			source: "selected",
		});
	}

	if (
		options.savedModelId &&
		options.savedModelId !== options.selectedModelId
	) {
		const savedInCatalog = fetchedModels.some(
			(model) => model.id === options.savedModelId,
		);
		if (!savedInCatalog) {
			injectModel(options.savedModelId, {
				unavailableInCatalog: true,
				source: "saved",
			});
		}
	}

	return merged;
}

export function resolveSavedModelIdForProvider(
	provider: AIProvider,
	settings: {
		insightsDefaultModelId?: string | null;
		defaultModelId?: string | null;
	},
): string | null {
	if (settings.defaultModelId) {
		return isCustomModelProvider(provider)
			? settings.defaultModelId.startsWith(`${provider}:`)
				? settings.defaultModelId
				: `${provider}:${settings.defaultModelId}`
			: settings.defaultModelId;
	}

	const globalDefault = settings.insightsDefaultModelId;
	if (globalDefault && getProviderFromModelId(globalDefault) === provider) {
		return globalDefault;
	}

	return null;
}
