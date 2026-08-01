import type { AIProvider } from "@/features/insights/constants";

export type AiCredentialSource = "database" | "env" | "none";

export type StoredAiProviderEntry = {
	encryptedApiKey?: string;
	baseUrl?: string;
	defaultModelId?: string;
};

export type StoredAiProviderSettings = Partial<
	Record<AIProvider, StoredAiProviderEntry>
>;

export type ResolvedProviderCredential = {
	apiKey?: string;
	baseUrl?: string;
	source: AiCredentialSource;
};

export type ResolvedAiCredentials = Record<
	AIProvider,
	ResolvedProviderCredential
>;

export type AiProviderSettingsViewEntry = {
	hasDatabaseKey: boolean;
	hasEnvFallback: boolean;
	activeSource: AiCredentialSource;
	apiKeyHint: string | null;
	baseUrl: string | null;
	defaultModelId: string | null;
};

export type AiProviderSettingsView = {
	insightsDefaultModelId: string | null;
	providers: Record<AIProvider, AiProviderSettingsViewEntry>;
};
