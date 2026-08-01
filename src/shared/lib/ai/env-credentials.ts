import type { AIProvider } from "@/features/insights/constants";
import { OPENCODE_PLAN_ZEN_URL } from "./opencode-plans";
import type { ResolvedProviderCredential } from "./types";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

export function getEnvProviderCredential(
	provider: AIProvider,
): ResolvedProviderCredential {
	switch (provider) {
		case "openai":
			return {
				apiKey: process.env.OPENAI_API_KEY,
				source: process.env.OPENAI_API_KEY ? "env" : "none",
			};
		case "anthropic":
			return {
				apiKey: process.env.ANTHROPIC_API_KEY,
				source: process.env.ANTHROPIC_API_KEY ? "env" : "none",
			};
		case "google":
			return {
				apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
				source: process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "env" : "none",
			};
		case "minimax":
			return {
				apiKey: process.env.MINIMAX_API_KEY,
				source: process.env.MINIMAX_API_KEY ? "env" : "none",
			};
		case "openrouter":
			return {
				apiKey: process.env.OPENROUTER_API_KEY,
				source: process.env.OPENROUTER_API_KEY ? "env" : "none",
			};
		case "opencode":
			return {
				apiKey: process.env.OPENCODE_API_KEY,
				baseUrl: process.env.OPENCODE_BASE_URL ?? OPENCODE_PLAN_ZEN_URL,
				source: process.env.OPENCODE_API_KEY ? "env" : "none",
			};
		case "ollama":
			return {
				apiKey: process.env.OLLAMA_API_KEY || "ollama",
				baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
				source: "env",
			};
		default:
			return { source: "none" };
	}
}

export function getEnvVariableName(provider: AIProvider): string | null {
	switch (provider) {
		case "openai":
			return "OPENAI_API_KEY";
		case "anthropic":
			return "ANTHROPIC_API_KEY";
		case "google":
			return "GOOGLE_GENERATIVE_AI_API_KEY";
		case "minimax":
			return "MINIMAX_API_KEY";
		case "openrouter":
			return "OPENROUTER_API_KEY";
		case "opencode":
			return "OPENCODE_API_KEY";
		case "ollama":
			return "OLLAMA_BASE_URL";
		default:
			return null;
	}
}
