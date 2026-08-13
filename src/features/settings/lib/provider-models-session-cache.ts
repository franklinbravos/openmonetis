import type { AIProvider } from "@/features/insights/constants";
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";

export type ProviderModelsCacheEntry = {
	models: ListedProviderModel[];
	credentialValidated: boolean;
};

const providerModelsSessionCache = new Map<string, ProviderModelsCacheEntry>();

export function buildProviderModelsCacheKey(
	provider: AIProvider,
	baseUrl: string,
	apiKey: string,
): string {
	return `${provider}:${baseUrl.trim()}:${apiKey.trim()}`;
}

export function readProviderModelsSessionCache(
	cacheKey: string,
): ProviderModelsCacheEntry | undefined {
	return providerModelsSessionCache.get(cacheKey);
}

export function writeProviderModelsSessionCache(
	cacheKey: string,
	entry: ProviderModelsCacheEntry,
): void {
	providerModelsSessionCache.set(cacheKey, entry);
}
