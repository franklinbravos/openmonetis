import { eq } from "drizzle-orm";
import { type AIProvider, PROVIDERS } from "@/features/insights/constants";
import { db, schema } from "@/shared/lib/db";
import { getEnvProviderCredential } from "./env-credentials";
import { decryptSecret, encryptSecret, maskApiKey } from "./secret-encryption";
import type {
	AiProviderSettingsView,
	AiProviderSettingsViewEntry,
	ResolvedAiCredentials,
	ResolvedProviderCredential,
	StoredAiProviderEntry,
	StoredAiProviderSettings,
} from "./types";

const AI_PROVIDER_IDS = Object.keys(PROVIDERS) as AIProvider[];

function decryptStoredEntry(
	entry: StoredAiProviderEntry | undefined,
): ResolvedProviderCredential {
	if (!entry) {
		return { source: "none" };
	}

	const credential: ResolvedProviderCredential = {
		baseUrl: entry.baseUrl,
		source: "none",
	};

	if (entry.encryptedApiKey) {
		try {
			credential.apiKey = decryptSecret(entry.encryptedApiKey);
			credential.source = "database";
		} catch (error) {
			console.error("Falha ao descriptografar chave de IA:", error);
		}
	}

	if (credential.source === "none" && (entry.baseUrl || entry.defaultModelId)) {
		credential.source = "database";
	}

	return credential;
}

function mergeWithEnvFallback(
	databaseCredential: ResolvedProviderCredential,
	provider: AIProvider,
): ResolvedProviderCredential {
	if (databaseCredential.source === "database") {
		const envCredential = getEnvProviderCredential(provider);
		return {
			apiKey: databaseCredential.apiKey ?? envCredential.apiKey,
			baseUrl: databaseCredential.baseUrl ?? envCredential.baseUrl,
			source: "database",
		};
	}

	const envCredential = getEnvProviderCredential(provider);
	if (envCredential.source === "env") {
		return envCredential;
	}

	return { source: "none" };
}

export function resolveProviderCredential(
	provider: AIProvider,
	stored: StoredAiProviderSettings | null | undefined,
): ResolvedProviderCredential {
	const databaseCredential = decryptStoredEntry(stored?.[provider]);
	return mergeWithEnvFallback(databaseCredential, provider);
}

export function resolveAllProviderCredentials(
	stored: StoredAiProviderSettings | null | undefined,
): ResolvedAiCredentials {
	return AI_PROVIDER_IDS.reduce((credentials, provider) => {
		credentials[provider] = resolveProviderCredential(provider, stored);
		return credentials;
	}, {} as ResolvedAiCredentials);
}

function buildProviderViewEntry(
	provider: AIProvider,
	stored: StoredAiProviderSettings | null | undefined,
): AiProviderSettingsViewEntry {
	const storedEntry = stored?.[provider];
	const envCredential = getEnvProviderCredential(provider);
	const resolved = resolveProviderCredential(provider, stored);

	let apiKeyHint: string | null = null;
	if (storedEntry?.encryptedApiKey) {
		try {
			apiKeyHint = maskApiKey(decryptSecret(storedEntry.encryptedApiKey));
		} catch {
			apiKeyHint = "Chave inválida";
		}
	} else if (envCredential.apiKey && envCredential.source === "env") {
		apiKeyHint = maskApiKey(envCredential.apiKey);
	}

	return {
		hasDatabaseKey: Boolean(storedEntry?.encryptedApiKey),
		hasEnvFallback: envCredential.source === "env",
		activeSource: resolved.source,
		apiKeyHint,
		baseUrl: storedEntry?.baseUrl ?? envCredential.baseUrl ?? null,
		defaultModelId: storedEntry?.defaultModelId ?? null,
	};
}

export async function fetchUserAiProviderSettings(userId: string): Promise<{
	insightsDefaultModelId: string | null;
	storedSettings: StoredAiProviderSettings | null;
	view: AiProviderSettingsView;
	credentials: ResolvedAiCredentials;
}> {
	const result = await db
		.select({
			insightsDefaultModelId: schema.userPreferences.insightsDefaultModelId,
			aiProviderSettings: schema.userPreferences.aiProviderSettings,
		})
		.from(schema.userPreferences)
		.where(eq(schema.userPreferences.userId, userId))
		.limit(1);

	const row = result[0];
	const storedSettings = row?.aiProviderSettings ?? null;
	const insightsDefaultModelId = row?.insightsDefaultModelId ?? null;

	const providers = AI_PROVIDER_IDS.reduce(
		(view, provider) => {
			view[provider] = buildProviderViewEntry(provider, storedSettings);
			return view;
		},
		{} as Record<AIProvider, AiProviderSettingsViewEntry>,
	);

	return {
		insightsDefaultModelId,
		storedSettings,
		view: {
			insightsDefaultModelId,
			providers,
		},
		credentials: resolveAllProviderCredentials(storedSettings),
	};
}

export function encryptApiKeyForStorage(apiKey: string): string {
	return encryptSecret(apiKey.trim());
}

export function mergeStoredProviderSettings(
	current: StoredAiProviderSettings | null | undefined,
	provider: AIProvider,
	updates: {
		apiKey?: string;
		clearApiKey?: boolean;
		baseUrl?: string | null;
		defaultModelId?: string | null;
	},
): StoredAiProviderSettings {
	const nextSettings: StoredAiProviderSettings = { ...(current ?? {}) };
	const currentEntry = { ...(nextSettings[provider] ?? {}) };

	if (updates.clearApiKey) {
		delete currentEntry.encryptedApiKey;
	}

	if (updates.apiKey?.trim()) {
		currentEntry.encryptedApiKey = encryptApiKeyForStorage(updates.apiKey);
	}

	if (updates.baseUrl !== undefined) {
		const trimmedBaseUrl = updates.baseUrl?.trim();
		if (trimmedBaseUrl) {
			currentEntry.baseUrl = trimmedBaseUrl;
		} else {
			delete currentEntry.baseUrl;
		}
	}

	if (updates.defaultModelId !== undefined) {
		const trimmedModelId = updates.defaultModelId?.trim();
		if (trimmedModelId) {
			currentEntry.defaultModelId = trimmedModelId;
		} else {
			delete currentEntry.defaultModelId;
		}
	}

	const hasRemainingValues =
		currentEntry.encryptedApiKey ||
		currentEntry.baseUrl ||
		currentEntry.defaultModelId;

	if (hasRemainingValues) {
		nextSettings[provider] = currentEntry;
	} else {
		delete nextSettings[provider];
	}

	return nextSettings;
}
