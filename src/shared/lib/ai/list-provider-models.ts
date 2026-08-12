import {
	type AIProvider,
	AVAILABLE_MODELS,
} from "@/features/insights/constants";
import {
	isOpenCodeFreeModelId,
	isOpenCodeZenBaseUrl,
	OPENCODE_PLAN_ZEN_URL,
} from "./opencode-plans";
import type { ResolvedAiCredentials } from "./types";

export type ListedProviderModel = {
	id: string;
	name: string;
	isFreeTier?: boolean;
	unavailableInCatalog?: boolean;
	metadata?: Record<string, unknown>;
};

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

function extractModelMetadata(
	model: Record<string, unknown>,
): Record<string, unknown> | undefined {
	const metadata: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(model)) {
		if (key === "id" || value == null) continue;
		metadata[key] = value;
	}

	return Object.keys(metadata).length > 0 ? metadata : undefined;
}

const STATIC_ONLY_PROVIDERS = new Set<AIProvider>(["anthropic", "minimax"]);

type ListProviderModelsInput = {
	provider: AIProvider;
	apiKey?: string;
	baseUrl?: string;
};

type ListProviderModelsResult =
	| { success: true; models: ListedProviderModel[] }
	| { success: false; error: string };

function getStaticModels(provider: AIProvider): ListedProviderModel[] {
	return AVAILABLE_MODELS.filter((model) => model.provider === provider).map(
		(model) => ({
			id: model.id,
			name: model.name,
		}),
	);
}

function sortModels(models: ListedProviderModel[]) {
	return [...models].sort((left, right) =>
		left.name.localeCompare(right.name, "pt-BR"),
	);
}

function uniqueModels(models: ListedProviderModel[]) {
	const seen = new Set<string>();
	return models.filter((model) => {
		if (seen.has(model.id)) {
			return false;
		}

		seen.add(model.id);
		return true;
	});
}

async function fetchJson<T>(
	url: string,
	init?: RequestInit,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
	try {
		const response = await fetch(url, {
			...init,
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			return {
				success: false,
				error:
					"Não foi possível listar os modelos. Verifique a chave e tente novamente.",
			};
		}

		const data = (await response.json()) as T;
		return { success: true, data };
	} catch {
		return {
			success: false,
			error:
				"Falha ao conectar com o provedor. Verifique a chave e a URL base.",
		};
	}
}

function prefixModelId(provider: AIProvider, modelId: string) {
	if (provider === "openrouter") {
		return modelId.startsWith("openrouter:")
			? modelId
			: `openrouter:${modelId}`;
	}

	if (provider === "opencode") {
		return modelId.startsWith("opencode:") ? modelId : `opencode:${modelId}`;
	}

	if (provider === "ollama") {
		return modelId.startsWith("ollama:") ? modelId : `ollama:${modelId}`;
	}

	return modelId;
}

async function listOpenAiModels(
	apiKey: string,
): Promise<ListProviderModelsResult> {
	const result = await fetchJson<{ data?: Array<{ id?: string }> }>(
		"https://api.openai.com/v1/models",
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		},
	);

	if (!result.success) {
		return result;
	}

	const models = uniqueModels(
		(result.data.data ?? [])
			.map((model) => model.id?.trim())
			.filter((modelId): modelId is string => Boolean(modelId))
			.filter(
				(modelId) =>
					modelId.startsWith("gpt-") ||
					modelId.startsWith("o1") ||
					modelId.startsWith("o3") ||
					modelId.startsWith("o4"),
			)
			.map((modelId) => ({
				id: modelId,
				name: modelId,
			})),
	);

	if (models.length === 0) {
		return {
			success: true,
			models: getStaticModels("openai"),
		};
	}

	return { success: true, models: sortModels(models) };
}

async function listGoogleModels(
	apiKey: string,
): Promise<ListProviderModelsResult> {
	const result = await fetchJson<{
		models?: Array<{ name?: string; displayName?: string }>;
	}>(
		`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
	);

	if (!result.success) {
		return result;
	}

	const models = uniqueModels(
		(result.data.models ?? [])
			.map((model) => {
				const rawName = model.name?.replace(/^models\//, "").trim();
				if (!rawName) {
					return null;
				}

				return {
					id: rawName,
					name: model.displayName?.trim() || rawName,
				};
			})
			.filter((model): model is ListedProviderModel => model !== null)
			.filter((model) => model.id.includes("gemini")),
	);

	if (models.length === 0) {
		return {
			success: true,
			models: getStaticModels("google"),
		};
	}

	return { success: true, models: sortModels(models) };
}

async function listOpenRouterModels(
	apiKey: string,
): Promise<ListProviderModelsResult> {
	const result = await fetchJson<{
		data?: Array<{ id?: string; name?: string }>;
	}>("https://openrouter.ai/api/v1/models", {
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});

	if (!result.success) {
		return result;
	}

	const models = uniqueModels(
		(result.data.data ?? [])
			.map((model) => {
				const modelId = model.id?.trim();
				if (!modelId) {
					return null;
				}

				return {
					id: prefixModelId("openrouter", modelId),
					name: model.name?.trim() || modelId,
				};
			})
			.filter((model): model is ListedProviderModel => model !== null),
	);

	return { success: true, models: sortModels(models) };
}

async function listOpenCodeModels(
	apiKey: string | undefined,
	baseUrl: string,
): Promise<ListProviderModelsResult> {
	const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
	const headers: HeadersInit = {};
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	const result = await fetchJson<{
		data?: Array<Record<string, unknown>>;
		models?: Array<Record<string, unknown>>;
	}>(`${normalizedBaseUrl}/models`, { headers });

	if (!result.success) {
		return result;
	}

	const rawModels = result.data.data ?? result.data.models ?? [];
	const models = uniqueModels(
		rawModels
			.map((model) => {
				const modelId = typeof model.id === "string" ? model.id.trim() : "";
				if (!modelId) {
					return null;
				}

				const displayName =
					typeof model.name === "string" && model.name.trim()
						? model.name.trim()
						: modelId;

				const listedModel: ListedProviderModel = {
					id: prefixModelId("opencode", modelId),
					name: displayName,
					isFreeTier:
						isOpenCodeZenBaseUrl(baseUrl) && isOpenCodeFreeModelId(modelId),
					metadata: extractModelMetadata(model),
				};

				return listedModel;
			})
			.filter((model): model is ListedProviderModel => model !== null),
	);

	if (models.length === 0) {
		return {
			success: false,
			error: "Nenhum modelo encontrado para o plano OpenCode selecionado.",
		};
	}

	return { success: true, models: sortModels(models) };
}

async function listOllamaModels(
	baseUrl: string,
): Promise<ListProviderModelsResult> {
	const rootUrl = baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
	const result = await fetchJson<{
		models?: Array<{ name?: string }>;
	}>(`${rootUrl}/api/tags`);

	if (!result.success) {
		return result;
	}

	const models = uniqueModels(
		(result.data.models ?? [])
			.map((model) => {
				const modelName = model.name?.trim();
				if (!modelName) {
					return null;
				}

				const shortName = modelName.split(":")[0] ?? modelName;
				return {
					id: prefixModelId("ollama", shortName),
					name: shortName,
				};
			})
			.filter((model): model is ListedProviderModel => model !== null),
	);

	if (models.length === 0) {
		return {
			success: false,
			error: "Nenhum modelo encontrado na instância Ollama configurada.",
		};
	}

	return { success: true, models: sortModels(models) };
}

export async function listProviderModels(
	input: ListProviderModelsInput,
): Promise<ListProviderModelsResult> {
	const { provider } = input;
	const apiKey = input.apiKey?.trim();
	const baseUrl =
		input.baseUrl?.trim() ||
		(provider === "opencode"
			? OPENCODE_PLAN_ZEN_URL
			: provider === "ollama"
				? DEFAULT_OLLAMA_BASE_URL
				: undefined);

	if (STATIC_ONLY_PROVIDERS.has(provider)) {
		return { success: true, models: getStaticModels(provider) };
	}

	if (provider === "ollama") {
		if (!baseUrl) {
			return {
				success: false,
				error: "Informe a URL base da instância Ollama.",
			};
		}

		return listOllamaModels(baseUrl);
	}

	if (!apiKey && provider !== "opencode") {
		return {
			success: false,
			error: "Informe a chave API do provedor para listar os modelos.",
		};
	}

	switch (provider) {
		case "openai":
			return listOpenAiModels(apiKey as string);
		case "google":
			return listGoogleModels(apiKey as string);
		case "openrouter":
			return listOpenRouterModels(apiKey as string);
		case "opencode":
			return listOpenCodeModels(apiKey, baseUrl ?? OPENCODE_PLAN_ZEN_URL);
		default:
			return {
				success: false,
				error: "Provedor não suportado para listagem dinâmica.",
			};
	}
}

export function applyProviderCredentialOverride(
	credentials: ResolvedAiCredentials,
	provider: AIProvider,
	override?: { apiKey?: string; baseUrl?: string },
) {
	if (!override) {
		return credentials;
	}

	const trimmedApiKey = override.apiKey?.trim();
	const trimmedBaseUrl = override.baseUrl?.trim();
	if (!trimmedApiKey && !trimmedBaseUrl) {
		return credentials;
	}

	const current = credentials[provider];

	return {
		...credentials,
		[provider]: {
			apiKey: trimmedApiKey || current.apiKey,
			baseUrl: trimmedBaseUrl || current.baseUrl,
			source: trimmedApiKey || current.apiKey ? "database" : current.source,
		},
	};
}
