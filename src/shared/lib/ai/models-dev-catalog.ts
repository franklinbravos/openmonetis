import { cache } from "react";
import { getOpenCodePlanFromBaseUrl } from "./opencode-plans";

export type ModelContextLimits = {
	contextTokens: number | null;
	inputTokens: number | null;
	outputTokens: number | null;
};

type ListedModelShape = {
	id: string;
	name: string;
	description?: string;
	isFreeTier?: boolean;
	unavailableInCatalog?: boolean;
	limits?: ModelContextLimits;
	metadata?: Record<string, unknown>;
};

type ModelsDevLimit = {
	context?: number;
	input?: number;
	output?: number;
};

type ModelsDevModelEntry = {
	id?: string;
	name?: string;
	description?: string;
	limit?: ModelsDevLimit;
};

type ModelsDevCatalog = Record<
	string,
	{
		models?: Record<string, ModelsDevModelEntry>;
	}
>;

export const fetchModelsDevCatalog = cache(
	async (): Promise<ModelsDevCatalog> => {
		try {
			const response = await fetch("https://models.dev/api.json", {
				signal: AbortSignal.timeout(15_000),
				next: { revalidate: 3600 },
			});

			if (!response.ok) {
				return {};
			}

			return (await response.json()) as ModelsDevCatalog;
		} catch {
			return {};
		}
	},
);

export function getModelsDevProviderKeyForOpenCode(baseUrl: string): string {
	return getOpenCodePlanFromBaseUrl(baseUrl) === "go"
		? "opencode-go"
		: "opencode";
}

export function lookupModelsDevModel(
	catalog: ModelsDevCatalog,
	providerKey: string,
	modelId: string,
): ModelsDevModelEntry | null {
	return catalog[providerKey]?.models?.[modelId] ?? null;
}

export function toModelContextLimits(
	limit: ModelsDevLimit | undefined,
): ModelContextLimits | undefined {
	if (!limit) return undefined;

	const contextTokens = limit.context ?? null;
	const inputTokens = limit.input ?? null;
	const outputTokens = limit.output ?? null;

	if (contextTokens == null && inputTokens == null && outputTokens == null) {
		return undefined;
	}

	return { contextTokens, inputTokens, outputTokens };
}

export function enrichListedModelsFromModelsDev<T extends ListedModelShape>(
	models: T[],
	catalog: ModelsDevCatalog,
	providerKey: string,
): T[] {
	return models.map((model) => {
		const rawModelId = model.id.includes(":")
			? model.id.slice(model.id.indexOf(":") + 1)
			: model.id;

		const catalogEntry = lookupModelsDevModel(catalog, providerKey, rawModelId);
		if (!catalogEntry) {
			return model;
		}

		const limits = toModelContextLimits(catalogEntry.limit);
		const metadata = { ...(model.metadata ?? {}) };

		if (catalogEntry.description && !metadata.description) {
			metadata.description = catalogEntry.description;
		}

		return {
			...model,
			name: catalogEntry.name?.trim() || model.name,
			description: catalogEntry.description,
			limits: limits ?? model.limits,
			metadata,
		};
	});
}
