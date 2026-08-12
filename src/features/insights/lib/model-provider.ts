import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { createMinimax, minimax } from "vercel-minimax-ai-provider";
import { getEnvProviderCredential } from "@/shared/lib/ai/env-credentials";
import { resolveOpenCodePlanBaseUrl } from "@/shared/lib/ai/opencode-plans";
import { getAiProviderNotConfiguredMessage } from "@/shared/lib/ai/provider-messages";
import type { ResolvedAiCredentials } from "@/shared/lib/ai/types";
import { resolveAllProviderCredentials } from "@/shared/lib/ai/user-provider-config";
import { AVAILABLE_MODELS } from "../constants";

const OPENROUTER_MODEL_REGEX = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:-]+$/;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

type ResolveInsightsModelResult =
	| { success: true; model: LanguageModel }
	| { success: false; error: string };

type CustomProviderPrefix = "openrouter" | "opencode" | "ollama";

function stripProviderPrefix(modelId: string, provider: CustomProviderPrefix) {
	return modelId.startsWith(`${provider}:`)
		? modelId.slice(`${provider}:`.length).trim()
		: modelId.trim();
}

function getOpenCodeZenRoot(baseURL: string) {
	return baseURL.replace(/\/v1\/?$/, "");
}

function resolveOpenCodeModel(
	opencodeModelId: string,
	credentials: ResolvedAiCredentials,
): ResolveInsightsModelResult {
	const opencodeCredential = credentials.opencode;
	const apiKey = opencodeCredential.apiKey;

	if (!apiKey) {
		return {
			success: false,
			error: getAiProviderNotConfiguredMessage("opencode"),
		};
	}

	if (!opencodeModelId) {
		return {
			success: false,
			error: "Informe um modelo válido do OpenCode.",
		};
	}

	const baseURL = resolveOpenCodePlanBaseUrl(opencodeCredential.baseUrl);
	const zenRoot = getOpenCodeZenRoot(baseURL);

	if (opencodeModelId.startsWith("claude-")) {
		const anthropicProvider = createAnthropic({
			baseURL: `${zenRoot}/v1`,
			apiKey,
		});

		return { success: true, model: anthropicProvider(opencodeModelId) };
	}

	if (opencodeModelId.startsWith("gpt-")) {
		const openaiProvider = createOpenAI({
			baseURL,
			apiKey,
		});

		return { success: true, model: openaiProvider.chat(opencodeModelId) };
	}

	if (opencodeModelId.startsWith("gemini-")) {
		const googleProvider = createGoogleGenerativeAI({
			baseURL: `${zenRoot}/v1beta`,
			apiKey,
		});

		return { success: true, model: googleProvider(opencodeModelId) };
	}

	const opencode = createOpenAICompatible({
		name: "opencode",
		baseURL,
		apiKey,
		supportsStructuredOutputs: false,
	});

	return { success: true, model: opencode.chatModel(opencodeModelId) };
}

function resolveOpenAiModel(
	modelId: string,
	credentials: ResolvedAiCredentials,
): ResolveInsightsModelResult {
	const apiKey = credentials.openai.apiKey;
	if (!apiKey) {
		return {
			success: false,
			error: getAiProviderNotConfiguredMessage("openai"),
		};
	}

	if (credentials.openai.source === "database") {
		return { success: true, model: createOpenAI({ apiKey })(modelId) };
	}

	return { success: true, model: openai(modelId) };
}

function resolveAnthropicModel(
	modelId: string,
	credentials: ResolvedAiCredentials,
): ResolveInsightsModelResult {
	const apiKey = credentials.anthropic.apiKey;
	if (!apiKey) {
		return {
			success: false,
			error: getAiProviderNotConfiguredMessage("anthropic"),
		};
	}

	if (credentials.anthropic.source === "database") {
		return { success: true, model: createAnthropic({ apiKey })(modelId) };
	}

	return { success: true, model: anthropic(modelId) };
}

function resolveGoogleModel(
	modelId: string,
	credentials: ResolvedAiCredentials,
): ResolveInsightsModelResult {
	const apiKey = credentials.google.apiKey;
	if (!apiKey) {
		return {
			success: false,
			error: getAiProviderNotConfiguredMessage("google"),
		};
	}

	if (credentials.google.source === "database") {
		return {
			success: true,
			model: createGoogleGenerativeAI({ apiKey })(modelId),
		};
	}

	return { success: true, model: google(modelId) };
}

function resolveMinimaxModel(
	modelId: string,
	credentials: ResolvedAiCredentials,
): ResolveInsightsModelResult {
	const apiKey = credentials.minimax.apiKey;
	if (!apiKey) {
		return {
			success: false,
			error: getAiProviderNotConfiguredMessage("minimax"),
		};
	}

	if (credentials.minimax.source === "database") {
		return { success: true, model: createMinimax({ apiKey })(modelId) };
	}

	return { success: true, model: minimax(modelId) };
}

export function resolveInsightsModel(
	modelId: string,
	credentials: ResolvedAiCredentials = resolveAllProviderCredentials(null),
): ResolveInsightsModelResult {
	const normalizedModelId = modelId.trim();
	const selectedModel = AVAILABLE_MODELS.find(
		(model) => model.id === normalizedModelId,
	);
	const isOpenRouterModel =
		normalizedModelId.startsWith("openrouter:") ||
		(!selectedModel && OPENROUTER_MODEL_REGEX.test(normalizedModelId));
	const isOpenCodeModel = normalizedModelId.startsWith("opencode:");
	const isOllamaModel = normalizedModelId.startsWith("ollama:");

	if (
		!selectedModel &&
		!isOpenRouterModel &&
		!isOpenCodeModel &&
		!isOllamaModel
	) {
		if (/^(gpt-|o\d)/.test(normalizedModelId)) {
			return resolveOpenAiModel(normalizedModelId, credentials);
		}

		if (normalizedModelId.startsWith("gemini-")) {
			return resolveGoogleModel(normalizedModelId, credentials);
		}

		if (normalizedModelId.startsWith("claude-")) {
			return resolveAnthropicModel(normalizedModelId, credentials);
		}

		if (normalizedModelId.startsWith("MiniMax-")) {
			return resolveMinimaxModel(normalizedModelId, credentials);
		}

		return {
			success: false,
			error: "Modelo inválido.",
		};
	}

	if (isOpenRouterModel) {
		const apiKey = credentials.openrouter.apiKey;
		if (!apiKey) {
			return {
				success: false,
				error: getAiProviderNotConfiguredMessage("openrouter"),
			};
		}

		const openrouterModelId = stripProviderPrefix(
			normalizedModelId,
			"openrouter",
		);

		if (!openrouterModelId) {
			return {
				success: false,
				error: "Informe um modelo válido do OpenRouter.",
			};
		}

		const openrouter = createOpenRouter({ apiKey });
		return { success: true, model: openrouter.chat(openrouterModelId) };
	}

	if (isOpenCodeModel) {
		return resolveOpenCodeModel(
			stripProviderPrefix(normalizedModelId, "opencode"),
			credentials,
		);
	}

	if (isOllamaModel || selectedModel?.provider === "ollama") {
		const ollamaModelId = stripProviderPrefix(normalizedModelId, "ollama");
		if (!ollamaModelId) {
			return {
				success: false,
				error: "Informe um modelo válido do Ollama.",
			};
		}

		const ollamaCredential = credentials.ollama;
		const ollama = createOpenAICompatible({
			name: "ollama",
			baseURL: ollamaCredential.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
			apiKey:
				ollamaCredential.apiKey ?? getEnvProviderCredential("ollama").apiKey,
			supportsStructuredOutputs: false,
		});

		return { success: true, model: ollama.chatModel(ollamaModelId) };
	}

	if (selectedModel?.provider === "openai") {
		return resolveOpenAiModel(normalizedModelId, credentials);
	}

	if (selectedModel?.provider === "anthropic") {
		return resolveAnthropicModel(normalizedModelId, credentials);
	}

	if (selectedModel?.provider === "google") {
		return resolveGoogleModel(normalizedModelId, credentials);
	}

	if (selectedModel?.provider === "minimax") {
		return resolveMinimaxModel(normalizedModelId, credentials);
	}

	return {
		success: false,
		error: "Provider de modelo não suportado.",
	};
}
