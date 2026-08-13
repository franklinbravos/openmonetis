"use client";

import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import { fetchProviderModelsAction } from "@/features/insights/actions";
import {
	type AIProvider,
	AVAILABLE_MODELS,
	DEFAULT_PROVIDER,
} from "@/features/insights/constants";
import { updateAiProviderSettingsAction } from "@/features/settings/actions/ai-providers";
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";
import {
	mergeListedProviderModels,
	resolveSavedModelIdForProvider,
} from "@/shared/lib/ai/merge-listed-provider-models";
import {
	getProviderFromModelId,
	isCustomModelProvider,
	stripCustomProviderPrefix,
} from "@/shared/lib/ai/model-config-helpers";
import { OPENCODE_PLAN_ZEN_URL } from "@/shared/lib/ai/opencode-plans";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";
import {
	buildProviderModelsCacheKey,
	type ProviderModelsCacheEntry,
	readProviderModelsSessionCache,
	writeProviderModelsSessionCache,
} from "../lib/provider-models-session-cache";

interface UseAiModelConfigurationOptions {
	settings: AiProviderSettingsView;
	selectedModelId: string;
	onSelectedModelIdChange: (modelId: string) => void;
	disabled?: boolean;
}

function isIncompleteCustomModelId(modelId: string, provider: AIProvider) {
	return isCustomModelProvider(provider) && modelId === `${provider}:`;
}

function resolveProviderBaseUrl(
	provider: AIProvider,
	providerSettings: AiProviderSettingsView["providers"],
): string {
	if (provider === "opencode") {
		return providerSettings[provider]?.baseUrl ?? OPENCODE_PLAN_ZEN_URL;
	}

	return providerSettings[provider]?.baseUrl ?? "";
}

function hydrateModelsFromSessionCache(
	cacheKey: string,
): ProviderModelsCacheEntry | null {
	const cached = readProviderModelsSessionCache(cacheKey);
	if (!cached || cached.models.length === 0) {
		return null;
	}

	return cached;
}

export function useAiModelConfiguration({
	settings,
	selectedModelId,
	onSelectedModelIdChange,
	disabled,
}: UseAiModelConfigurationOptions) {
	const router = useRouter();
	const providerSettings = settings.providers;
	const currentProvider =
		getProviderFromModelId(selectedModelId) ?? DEFAULT_PROVIDER;
	const providerConfig = providerSettings[currentProvider];
	const hasInvalidDatabaseKey = providerConfig?.hasInvalidDatabaseKey ?? false;
	const hasConfiguredCredential =
		providerConfig?.activeSource !== "none" && !hasInvalidDatabaseKey;

	const initialProvider =
		getProviderFromModelId(selectedModelId) ?? DEFAULT_PROVIDER;
	const initialBaseUrl = resolveProviderBaseUrl(
		initialProvider,
		settings.providers,
	);
	const initialSessionCache = readProviderModelsSessionCache(
		buildProviderModelsCacheKey(initialProvider, initialBaseUrl, ""),
	);

	const [apiKeyInput, setApiKeyInput] = useState("");
	const [baseUrlInput, setBaseUrlInput] = useState(
		providerConfig?.baseUrl ?? initialBaseUrl,
	);
	const [fetchedModels, setFetchedModels] = useState<ListedProviderModel[]>(
		() => initialSessionCache?.models ?? [],
	);
	const [isLoadingModels, setIsLoadingModels] = useState(false);
	const [modelsError, setModelsError] = useState<string | null>(null);
	const [credentialValidated, setCredentialValidated] = useState(
		() => initialSessionCache?.credentialValidated ?? false,
	);
	const [lastSavedModelId, setLastSavedModelId] = useState(
		settings.insightsDefaultModelId ?? "",
	);
	const [lastSavedBaseUrl, setLastSavedBaseUrl] = useState(
		providerConfig?.baseUrl ?? "",
	);
	const [isSaving, startSave] = useTransition();
	const autoSaveAttemptRef = useRef<string | null>(null);
	const previousProviderRef = useRef(currentProvider);

	const modelsCacheKey = useMemo(
		() =>
			buildProviderModelsCacheKey(currentProvider, baseUrlInput, apiKeyInput),
		[currentProvider, baseUrlInput, apiKeyInput],
	);

	const savedModelIdForProvider = useMemo(
		() =>
			resolveSavedModelIdForProvider(currentProvider, {
				defaultModelId: providerConfig?.defaultModelId,
				insightsDefaultModelId: settings.insightsDefaultModelId,
			}),
		[
			currentProvider,
			providerConfig?.defaultModelId,
			settings.insightsDefaultModelId,
		],
	);

	const displayModels = useMemo(
		() =>
			mergeListedProviderModels(fetchedModels, {
				selectedModelId,
				savedModelId: savedModelIdForProvider,
				currentProvider,
			}),
		[fetchedModels, selectedModelId, savedModelIdForProvider, currentProvider],
	);

	const selectedModel = useMemo(
		() => displayModels.find((model) => model.id === selectedModelId) ?? null,
		[displayModels, selectedModelId],
	);

	useEffect(() => {
		if (previousProviderRef.current === currentProvider) {
			return;
		}

		previousProviderRef.current = currentProvider;
		setApiKeyInput("");

		const nextBaseUrl = resolveProviderBaseUrl(
			currentProvider,
			providerSettings,
		);
		setBaseUrlInput(nextBaseUrl);
		setLastSavedBaseUrl(nextBaseUrl);
		setModelsError(null);

		const cached = hydrateModelsFromSessionCache(
			buildProviderModelsCacheKey(currentProvider, nextBaseUrl, ""),
		);
		setFetchedModels(cached?.models ?? []);
		setCredentialValidated(cached?.credentialValidated ?? false);

		const providerSavedModel = resolveSavedModelIdForProvider(currentProvider, {
			defaultModelId: providerSettings[currentProvider]?.defaultModelId,
			insightsDefaultModelId: settings.insightsDefaultModelId,
		});

		if (providerSavedModel) {
			onSelectedModelIdChange(providerSavedModel);
			return;
		}

		const firstStaticModel = AVAILABLE_MODELS.find(
			(model) => model.provider === currentProvider,
		);
		if (firstStaticModel) {
			onSelectedModelIdChange(firstStaticModel.id);
			return;
		}

		if (isCustomModelProvider(currentProvider)) {
			onSelectedModelIdChange(`${currentProvider}:`);
		}
	}, [
		currentProvider,
		onSelectedModelIdChange,
		providerSettings,
		settings.insightsDefaultModelId,
	]);

	useEffect(() => {
		const cached = hydrateModelsFromSessionCache(modelsCacheKey);
		if (cached) {
			setFetchedModels(cached.models);
			setCredentialValidated(cached.credentialValidated);
			setModelsError(null);
			return;
		}

		setCredentialValidated(false);
	}, [modelsCacheKey]);

	useEffect(() => {
		const serverModelId = settings.insightsDefaultModelId ?? "";
		setLastSavedModelId(serverModelId);

		const serverProvider = getProviderFromModelId(serverModelId);
		if (serverProvider === currentProvider && serverModelId) {
			onSelectedModelIdChange(serverModelId);
		}

		const savedBaseUrl = resolveProviderBaseUrl(
			currentProvider,
			providerSettings,
		);
		setLastSavedBaseUrl(savedBaseUrl);
	}, [
		currentProvider,
		onSelectedModelIdChange,
		providerSettings,
		settings.insightsDefaultModelId,
	]);

	const loadProviderModels = useCallback(
		async (options?: { showFeedback?: boolean }) => {
			const cacheKey = buildProviderModelsCacheKey(
				currentProvider,
				baseUrlInput,
				apiKeyInput,
			);
			const canTestNow =
				currentProvider === "ollama" ||
				currentProvider === "opencode" ||
				apiKeyInput.trim().length > 0 ||
				hasConfiguredCredential ||
				Boolean(providerConfig?.hasDatabaseKey);

			if (!canTestNow) {
				const cached = hydrateModelsFromSessionCache(cacheKey);
				if (!cached) {
					setFetchedModels([]);
				}
				setModelsError(null);
				if (options?.showFeedback) {
					toast.error(
						"Salve uma chave em Ajustes ou informe uma nova chave para testar.",
					);
				}
				return;
			}

			setIsLoadingModels(true);
			setModelsError(null);

			const result = await fetchProviderModelsAction({
				provider: currentProvider,
				apiKey: apiKeyInput.trim() || undefined,
				baseUrl: baseUrlInput.trim() || undefined,
			});

			setIsLoadingModels(false);

			if (!result.success) {
				const cached = hydrateModelsFromSessionCache(cacheKey);
				if (cached) {
					setFetchedModels(cached.models);
					setCredentialValidated(cached.credentialValidated);
				} else {
					setFetchedModels([]);
					setCredentialValidated(false);
				}
				setModelsError(result.error);
				if (options?.showFeedback) {
					toast.error(result.error);
				}
				return;
			}

			const hasTypedKey = apiKeyInput.trim().length > 0;
			const providerListsWithoutKey =
				currentProvider === "opencode" || currentProvider === "ollama";
			const nextCredentialValidated =
				result.data.models.length > 0 &&
				(hasTypedKey || hasConfiguredCredential || providerListsWithoutKey);

			setFetchedModels(result.data.models);
			setCredentialValidated(nextCredentialValidated);
			writeProviderModelsSessionCache(cacheKey, {
				models: result.data.models,
				credentialValidated: nextCredentialValidated,
			});

			if (options?.showFeedback) {
				toast.success(
					`Chave válida. ${result.data.models.length} modelo(s) disponível(is).`,
				);
			}
		},
		[
			apiKeyInput,
			baseUrlInput,
			currentProvider,
			hasConfiguredCredential,
			providerConfig?.hasDatabaseKey,
		],
	);

	const canListModels =
		currentProvider === "ollama" ||
		currentProvider === "opencode" ||
		apiKeyInput.trim().length > 0 ||
		(hasConfiguredCredential && !hasInvalidDatabaseKey);

	useEffect(() => {
		if (!canListModels) {
			setModelsError(null);
			return;
		}

		const timer = window.setTimeout(() => {
			void loadProviderModels();
		}, 450);

		return () => {
			window.clearTimeout(timer);
		};
	}, [canListModels, loadProviderModels, modelsCacheKey]);

	const canTestCredential =
		currentProvider === "ollama" ||
		currentProvider === "opencode" ||
		apiKeyInput.trim().length > 0 ||
		hasConfiguredCredential ||
		Boolean(providerConfig?.hasDatabaseKey);

	const handleTestCredential = useCallback(() => {
		if (disabled || isLoadingModels || isSaving) {
			return;
		}

		void loadProviderModels({ showFeedback: true });
	}, [disabled, isLoadingModels, isSaving, loadProviderModels]);

	useEffect(() => {
		if (fetchedModels.length === 0) {
			return;
		}

		if (isIncompleteCustomModelId(selectedModelId, currentProvider)) {
			const preferred =
				savedModelIdForProvider &&
				fetchedModels.some((model) => model.id === savedModelIdForProvider)
					? savedModelIdForProvider
					: fetchedModels[0]?.id;
			if (preferred) {
				onSelectedModelIdChange(preferred);
			}
		}
	}, [
		currentProvider,
		fetchedModels,
		onSelectedModelIdChange,
		savedModelIdForProvider,
		selectedModelId,
	]);

	const savedBaseUrl =
		currentProvider === "opencode"
			? (providerConfig?.baseUrl ?? OPENCODE_PLAN_ZEN_URL)
			: (providerConfig?.baseUrl ?? "");

	const hasUnsavedChanges =
		apiKeyInput.trim().length > 0 ||
		baseUrlInput.trim() !== lastSavedBaseUrl.trim() ||
		selectedModelId !== lastSavedModelId;

	const requiresFreshKeyValidation =
		apiKeyInput.trim().length > 0 || hasInvalidDatabaseKey;

	const canSave =
		Boolean(selectedModelId) &&
		!isIncompleteCustomModelId(selectedModelId, currentProvider) &&
		(currentProvider === "ollama" ||
			(currentProvider === "opencode" &&
				!requiresFreshKeyValidation &&
				credentialValidated) ||
			(requiresFreshKeyValidation
				? apiKeyInput.trim().length > 0 && credentialValidated
				: credentialValidated || hasConfiguredCredential));

	const persistSettings = useCallback(
		async (options?: { silent?: boolean }) => {
			const trimmedKey = apiKeyInput.trim();
			const resolvedBaseUrl =
				currentProvider === "opencode"
					? baseUrlInput.trim() || savedBaseUrl
					: baseUrlInput.trim() || undefined;

			const result = await updateAiProviderSettingsAction({
				insightsDefaultModelId: selectedModelId,
				providers: {
					[currentProvider]: {
						...(trimmedKey ? { apiKey: trimmedKey } : {}),
						...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
						defaultModelId: stripCustomProviderPrefix(
							selectedModelId,
							currentProvider,
						),
					},
				},
			});

			if (result.success) {
				setLastSavedModelId(selectedModelId);
				setLastSavedBaseUrl(resolvedBaseUrl ?? "");
				setApiKeyInput("");
				if (!options?.silent) {
					toast.success(result.message ?? "Configurações salvas.");
				}
				router.refresh();
				return true;
			}

			toast.error(result.error ?? "Erro ao salvar configurações.");
			return false;
		},
		[
			apiKeyInput,
			baseUrlInput,
			currentProvider,
			router,
			savedBaseUrl,
			selectedModelId,
		],
	);

	const handleSave = useCallback(() => {
		if (!canSave || isSaving || disabled) {
			return;
		}

		startSave(async () => {
			await persistSettings();
		});
	}, [canSave, disabled, isSaving, persistSettings]);

	useEffect(() => {
		if (disabled || isSaving || apiKeyInput.trim().length > 0) {
			return;
		}

		if (!canSave || !hasUnsavedChanges) {
			return;
		}

		const canAutoSaveWithoutStoredCredential =
			currentProvider === "opencode" || currentProvider === "ollama";

		if (
			!credentialValidated ||
			(!hasConfiguredCredential && !canAutoSaveWithoutStoredCredential)
		) {
			return;
		}

		const autoSaveKey = `${currentProvider}:${selectedModelId}:${baseUrlInput.trim()}`;
		if (autoSaveAttemptRef.current === autoSaveKey) {
			return;
		}

		const timer = window.setTimeout(() => {
			autoSaveAttemptRef.current = autoSaveKey;
			startSave(async () => {
				const saved = await persistSettings({ silent: true });
				if (saved) {
					toast.success("Modelo salvo no banco.");
				} else {
					autoSaveAttemptRef.current = null;
				}
			});
		}, 900);

		return () => {
			window.clearTimeout(timer);
		};
	}, [
		apiKeyInput,
		baseUrlInput,
		canSave,
		credentialValidated,
		currentProvider,
		disabled,
		hasConfiguredCredential,
		hasUnsavedChanges,
		isSaving,
		persistSettings,
		selectedModelId,
	]);

	const handleProviderChange = (newProvider: AIProvider) => {
		const defaultModelId = providerSettings[newProvider]?.defaultModelId;
		const staticModels = AVAILABLE_MODELS.filter(
			(model) => model.provider === newProvider,
		);

		if (defaultModelId) {
			if (isCustomModelProvider(newProvider)) {
				onSelectedModelIdChange(`${newProvider}:${defaultModelId}`);
				return;
			}

			onSelectedModelIdChange(defaultModelId);
			return;
		}

		const savedForProvider = resolveSavedModelIdForProvider(newProvider, {
			defaultModelId: providerSettings[newProvider]?.defaultModelId,
			insightsDefaultModelId: settings.insightsDefaultModelId,
		});
		if (savedForProvider) {
			onSelectedModelIdChange(savedForProvider);
			return;
		}

		const firstStaticModel = staticModels[0];
		if (firstStaticModel) {
			onSelectedModelIdChange(firstStaticModel.id);
			return;
		}

		if (isCustomModelProvider(newProvider)) {
			onSelectedModelIdChange(`${newProvider}:`);
		}
	};

	const handleModelSelect = (modelId: string) => {
		autoSaveAttemptRef.current = null;
		onSelectedModelIdChange(modelId);
	};

	return {
		currentProvider,
		providerConfig,
		hasConfiguredCredential,
		hasInvalidDatabaseKey,
		apiKeyInput,
		setApiKeyInput,
		baseUrlInput,
		setBaseUrlInput,
		fetchedModels: displayModels,
		selectedModel,
		isLoadingModels,
		modelsError,
		credentialValidated,
		handleProviderChange,
		handleModelSelect,
		handleSave,
		handleTestCredential,
		canTestCredential,
		isSaving,
		canSave: canSave && hasUnsavedChanges,
		hasUnsavedChanges,
		isSavedInDatabase:
			!hasUnsavedChanges &&
			Boolean(lastSavedModelId) &&
			selectedModelId === lastSavedModelId,
	};
}
