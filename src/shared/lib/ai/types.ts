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

/**
 * Reserva da análise com IA. Guarda credencial própria porque o caso comum é
 * ter uma segunda chave do mesmo provedor: quando a cota semanal da primeira
 * esgota, o modelo continua o mesmo, só a chave muda.
 */
export type StoredAiFallbackSettings = {
	enabled: boolean;
	modelId: string | null;
	encryptedApiKey?: string | null;
	baseUrl?: string | null;
};

/** O que a tela recebe: nunca a chave, só o indício de que existe uma salva. */
export type AiFallbackSettingsView = {
	enabled: boolean;
	modelId: string | null;
	hasOwnKey: boolean;
	baseUrl: string | null;
};

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
	hasInvalidDatabaseKey: boolean;
	hasEnvFallback: boolean;
	activeSource: AiCredentialSource;
	apiKeyHint: string | null;
	baseUrl: string | null;
	defaultModelId: string | null;
};

export type AiProviderSettingsView = {
	insightsDefaultModelId: string | null;
	/** Reserva usada quando o principal falha por cota ou indisponibilidade. */
	fallback: AiFallbackSettingsView;
	providers: Record<AIProvider, AiProviderSettingsViewEntry>;
};
