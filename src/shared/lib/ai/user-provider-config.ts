import { eq } from "drizzle-orm";
import { type AIProvider, PROVIDERS } from "@/features/insights/constants";
import { db, schema } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getEnvProviderCredential } from "./env-credentials";
import { resolveOpenCodePlanBaseUrl } from "./opencode-plans";
import {
	AI_STORED_KEY_MISSING_APP_SECRET_MESSAGE,
	AI_STORED_KEY_UNREADABLE_MESSAGE,
} from "./provider-messages";
import {
	diagnoseSecretReadFailure,
	encryptSecret,
	maskApiKey,
	type SecretReadFailureReason,
	tryDecryptSecret,
} from "./secret-encryption";
import type {
	AiProviderSettingsView,
	AiProviderSettingsViewEntry,
	ResolvedAiCredentials,
	ResolvedProviderCredential,
	StoredAiFallbackSettings,
	StoredAiProviderEntry,
	StoredAiProviderSettings,
} from "./types";

const AI_PROVIDER_IDS = Object.keys(PROVIDERS) as AIProvider[];

function hasStoredProviderSettings(
	entry: StoredAiProviderEntry | undefined,
): boolean {
	if (!entry) return false;

	return Boolean(
		entry.encryptedApiKey || entry.baseUrl || entry.defaultModelId,
	);
}

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
		const apiKey = tryDecryptSecret(entry.encryptedApiKey);
		if (apiKey) {
			credential.apiKey = apiKey;
			credential.source = "database";
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
	storedEntry: StoredAiProviderEntry | undefined,
): ResolvedProviderCredential {
	// Provedor configurado em Ajustes: usa só o banco, sem fallback de API key no .env
	if (hasStoredProviderSettings(storedEntry)) {
		const envDefaults = getEnvProviderCredential(provider);

		let baseUrl = databaseCredential.baseUrl;
		if (provider === "opencode") {
			baseUrl = baseUrl ? resolveOpenCodePlanBaseUrl(baseUrl) : undefined;
		} else if (!baseUrl) {
			baseUrl = envDefaults.baseUrl;
		}

		return {
			apiKey: databaseCredential.apiKey,
			baseUrl,
			source: databaseCredential.apiKey ? "database" : "none",
		};
	}

	const envCredential = getEnvProviderCredential(provider);
	if (envCredential.source === "env" && envCredential.apiKey) {
		return envCredential;
	}

	return { source: "none" };
}

export function resolveProviderCredential(
	provider: AIProvider,
	stored: StoredAiProviderSettings | null | undefined,
): ResolvedProviderCredential {
	const storedEntry = stored?.[provider];
	const databaseCredential = decryptStoredEntry(storedEntry);
	return mergeWithEnvFallback(databaseCredential, provider, storedEntry);
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
	if (resolved.apiKey) {
		apiKeyHint = maskApiKey(resolved.apiKey);
	} else if (storedEntry?.encryptedApiKey) {
		apiKeyHint = "Chave ilegível — salve novamente";
	} else if (envCredential.apiKey && envCredential.source === "env") {
		apiKeyHint = maskApiKey(envCredential.apiKey);
	}

	const hasInvalidDatabaseKey = Boolean(
		storedEntry?.encryptedApiKey && !resolved.apiKey,
	);

	return {
		hasDatabaseKey: Boolean(storedEntry?.encryptedApiKey),
		hasInvalidDatabaseKey,
		hasEnvFallback: envCredential.source === "env",
		activeSource: resolved.apiKey ? resolved.source : "none",
		apiKeyHint,
		baseUrl: storedEntry?.baseUrl ?? envCredential.baseUrl ?? null,
		defaultModelId: storedEntry?.defaultModelId ?? null,
	};
}

/** Configuração de IA única por instância (dono dos dados financeiros). */
export async function fetchInstanceAiProviderSettings(
	viewerUserId: string,
): Promise<Awaited<ReturnType<typeof fetchUserAiProviderSettings>>> {
	const settingsOwnerUserId = await getFinancialDataOwnerId(viewerUserId);
	return fetchUserAiProviderSettings(settingsOwnerUserId);
}

export type ResolvedAiFallback = {
	enabled: boolean;
	modelId: string | null;
	/** Já decifrada; null quando não há chave própria ou ela ficou ilegível. */
	apiKey: string | null;
	baseUrl: string | null;
};

/** Chave própria da reserva é decifrada aqui; ilegível vira ausência, não erro. */
function resolveStoredFallback(
	stored: StoredAiFallbackSettings | null,
): ResolvedAiFallback {
	if (!stored) {
		return { enabled: false, modelId: null, apiKey: null, baseUrl: null };
	}

	const apiKey = stored.encryptedApiKey
		? tryDecryptSecret(stored.encryptedApiKey)
		: null;

	if (stored.encryptedApiKey && apiKey == null) {
		console.error(
			"Chave da reserva de IA ilegível:",
			diagnoseSecretReadFailure(stored.encryptedApiKey),
		);
	}

	return {
		enabled: Boolean(stored.enabled),
		modelId: stored.modelId?.trim() || null,
		apiKey,
		baseUrl: stored.baseUrl?.trim() || null,
	};
}

/** Postgres: coluna inexistente. */ /** Postgres: coluna inexistente. */
function isUndefinedColumnError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const record = error as { code?: string; cause?: { code?: string } };
	return record.code === "42703" || record.cause?.code === "42703";
}

/**
 * Instância que ainda não rodou a migration do modelo de reserva continua
 * funcionando sem ele: é app auto-hospedado, o dono decide quando migrar, e
 * quebrar a tela de IA inteira por causa de uma coluna nova seria desproporcional.
 */
async function selectAiPreferencesRow(userId: string): Promise<
	Array<{
		insightsDefaultModelId: string | null;
		aiFallbackSettings: StoredAiFallbackSettings | null;
		aiProviderSettings: StoredAiProviderSettings | null;
	}>
> {
	try {
		return await db
			.select({
				insightsDefaultModelId: schema.userPreferences.insightsDefaultModelId,
				aiFallbackSettings: schema.userPreferences.aiFallbackSettings,
				aiProviderSettings: schema.userPreferences.aiProviderSettings,
			})
			.from(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, userId))
			.limit(1);
	} catch (error) {
		if (!isUndefinedColumnError(error)) throw error;

		console.warn(
			"preferencias_usuario.ai_fallback_settings ausente: rode as migrations para habilitar o modelo de reserva.",
		);

		const rows = await db
			.select({
				insightsDefaultModelId: schema.userPreferences.insightsDefaultModelId,
				aiProviderSettings: schema.userPreferences.aiProviderSettings,
			})
			.from(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, userId))
			.limit(1);

		return rows.map((row) => ({ ...row, aiFallbackSettings: null }));
	}
}

export async function fetchUserAiProviderSettings(userId: string): Promise<{
	insightsDefaultModelId: string | null;
	fallback: ResolvedAiFallback;
	storedSettings: StoredAiProviderSettings | null;
	view: AiProviderSettingsView;
	credentials: ResolvedAiCredentials;
}> {
	const result = await selectAiPreferencesRow(userId);

	const row = result[0];
	const storedSettings = row?.aiProviderSettings ?? null;
	const insightsDefaultModelId = row?.insightsDefaultModelId ?? null;
	const fallback = resolveStoredFallback(row?.aiFallbackSettings ?? null);

	const providers = AI_PROVIDER_IDS.reduce(
		(view, provider) => {
			view[provider] = buildProviderViewEntry(provider, storedSettings);
			return view;
		},
		{} as Record<AIProvider, AiProviderSettingsViewEntry>,
	);

	return {
		insightsDefaultModelId,
		fallback,
		storedSettings,
		view: {
			insightsDefaultModelId,
			fallback: {
				enabled: fallback.enabled,
				modelId: fallback.modelId,
				hasOwnKey: fallback.apiKey != null,
				baseUrl: fallback.baseUrl,
			},
			providers,
		},
		credentials: resolveAllProviderCredentials(storedSettings),
	};
}

export function hasInvalidStoredAiKeyForProvider(
	stored: StoredAiProviderSettings | null | undefined,
	provider: AIProvider,
): boolean {
	const entry = stored?.[provider];
	if (!entry?.encryptedApiKey) return false;
	return tryDecryptSecret(entry.encryptedApiKey) == null;
}

export function hasInvalidStoredAiKeys(
	stored: StoredAiProviderSettings | null | undefined,
): boolean {
	if (!stored) return false;

	const hasInvalid = AI_PROVIDER_IDS.some((provider) =>
		hasInvalidStoredAiKeyForProvider(stored, provider),
	);

	if (hasInvalid) {
		const details = AI_PROVIDER_IDS.flatMap((provider) => {
			const entry = stored[provider];
			if (!entry?.encryptedApiKey) return [];
			if (tryDecryptSecret(entry.encryptedApiKey) != null) return [];
			return [
				`${provider}: ${diagnoseSecretReadFailure(entry.encryptedApiKey)}`,
			];
		}).join(", ");

		console.error("[hasInvalidStoredAiKeys] chaves de IA ilegíveis no banco", {
			hasAppSecret: Boolean(process.env.APP_SECRET),
			details,
		});
	}

	return hasInvalid;
}

/**
 * Mensagem contextual quando há chaves ilegíveis no banco. Diferencia a causa
 * mais comum (APP_SECRET ausente no servidor) da troca de APP_SECRET.
 */
export function getStoredKeyUnreadableMessage(
	stored: StoredAiProviderSettings | null | undefined,
): string {
	if (!stored) return AI_STORED_KEY_UNREADABLE_MESSAGE;

	const anyMalformed = AI_PROVIDER_IDS.some((provider) => {
		const entry = stored[provider];
		if (!entry?.encryptedApiKey) return false;
		return tryDecryptSecret(entry.encryptedApiKey) == null;
	});

	if (!anyMalformed) return AI_STORED_KEY_UNREADABLE_MESSAGE;

	const firstFailure = AI_PROVIDER_IDS.map((provider) => {
		const entry = stored[provider];
		if (!entry?.encryptedApiKey) return null;
		if (tryDecryptSecret(entry.encryptedApiKey) != null) return null;
		return diagnoseSecretReadFailure(entry.encryptedApiKey);
	}).find((reason): reason is SecretReadFailureReason => Boolean(reason));

	if (firstFailure === "missing_app_secret") {
		return AI_STORED_KEY_MISSING_APP_SECRET_MESSAGE;
	}

	return AI_STORED_KEY_UNREADABLE_MESSAGE;
}

export function isAnyAiProviderConfigured(
	credentials: ResolvedAiCredentials,
): boolean {
	return Object.values(credentials).some(
		(credential) => credential.source !== "none" && Boolean(credential.apiKey),
	);
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
