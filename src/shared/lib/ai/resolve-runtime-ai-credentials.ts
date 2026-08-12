import type { AIProvider } from "@/features/insights/constants";
import { resolveOpenCodePlanBaseUrl } from "./opencode-plans";
import type {
	ResolvedAiCredentials,
	ResolvedProviderCredential,
} from "./types";
import {
	resolveAllProviderCredentials,
	resolveProviderCredential,
} from "./user-provider-config";

type RuntimeCredentialOverride = {
	apiKey?: string;
	baseUrl?: string;
};

function normalizeRuntimeBaseUrl(
	provider: AIProvider,
	baseUrl: string | undefined,
): string | undefined {
	const trimmed = baseUrl?.trim();
	if (!trimmed) return undefined;

	if (provider === "opencode") {
		return resolveOpenCodePlanBaseUrl(trimmed);
	}

	return trimmed;
}

export function resolveRuntimeProviderCredential(
	provider: AIProvider,
	stored: Parameters<typeof resolveProviderCredential>[1],
	override?: RuntimeCredentialOverride,
): ResolvedProviderCredential {
	const resolved = resolveProviderCredential(provider, stored);
	const overrideApiKey = override?.apiKey?.trim();
	const overrideBaseUrl = normalizeRuntimeBaseUrl(provider, override?.baseUrl);

	return {
		apiKey: overrideApiKey || resolved.apiKey,
		baseUrl: overrideBaseUrl ?? resolved.baseUrl,
		source: overrideApiKey || resolved.apiKey ? resolved.source : "none",
	};
}

export function resolveRuntimeAiCredentials(
	stored: Parameters<typeof resolveAllProviderCredentials>[0],
	override?: RuntimeCredentialOverride & { provider?: AIProvider },
): ResolvedAiCredentials {
	const credentials = resolveAllProviderCredentials(stored);

	if (!override?.provider) {
		return credentials;
	}

	return {
		...credentials,
		[override.provider]: resolveRuntimeProviderCredential(
			override.provider,
			stored,
			override,
		),
	};
}

export function applyRuntimeCredentialOverride(
	credentials: ResolvedAiCredentials,
	provider: AIProvider,
	override?: RuntimeCredentialOverride,
): ResolvedAiCredentials {
	if (!override?.apiKey?.trim() && !override?.baseUrl?.trim()) {
		return credentials;
	}

	const current = credentials[provider];
	const overrideBaseUrl = normalizeRuntimeBaseUrl(provider, override.baseUrl);

	return {
		...credentials,
		[provider]: {
			apiKey: override.apiKey?.trim() || current.apiKey,
			baseUrl: overrideBaseUrl ?? current.baseUrl,
			source: current.source,
		},
	};
}
