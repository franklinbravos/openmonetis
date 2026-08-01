"use client";

import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
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
	getProviderFromModelId,
	isCustomModelProvider,
} from "@/shared/lib/ai/model-config-helpers";
import { OPENCODE_PLAN_ZEN_URL } from "@/shared/lib/ai/opencode-plans";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";

interface UseAiModelConfigurationOptions {
	settings: AiProviderSettingsView;
	selectedModelId: string;
	onSelectedModelIdChange: (modelId: string) => void;
	disabled?: boolean;
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
	const hasConfiguredCredential = providerConfig?.activeSource !== "none";

	const [apiKeyInput, setApiKeyInput] = useState("");
	const [baseUrlInput, setBaseUrlInput] = useState(
		providerConfig?.baseUrl ?? "",
	);
	const [fetchedModels, setFetchedModels] = useState<ListedProviderModel[]>([]);
	const [isLoadingModels, setIsLoadingModels] = useState(false);
	const [modelsError, setModelsError] = useState<string | null>(null);
	const [credentialValidated, setCredentialValidated] = useState(false);
	const [lastSavedModelId, setLastSavedModelId] = useState(
		settings.insightsDefaultModelId ?? "",
	);
	const [isSaving, startSave] = useTransition();

	useEffect(() => {
		setApiKeyInput("");
		const nextBaseUrl =
			currentProvider === "opencode"
				? (providerSettings[currentProvider]?.baseUrl ?? OPENCODE_PLAN_ZEN_URL)
				: (providerSettings[currentProvider]?.baseUrl ?? "");
		setBaseUrlInput(nextBaseUrl);
		setFetchedModels([]);
		setModelsError(null);
		setCredentialValidated(false);
	}, [currentProvider, providerSettings]);

	useEffect(() => {
		setCredentialValidated(false);
	}, [apiKeyInput, baseUrlInput, currentProvider]);

	useEffect(() => {
		setLastSavedModelId(settings.insightsDefaultModelId ?? "");
	}, [settings.insightsDefaultModelId]);

	const canListModels =
		currentProvider === "ollama" ||
		currentProvider === "opencode" ||
		apiKeyInput.trim().length > 0 ||
		hasConfiguredCredential;

	const loadProviderModels = useCallback(async () => {
		if (!canListModels) {
			setFetchedModels([]);
			setModelsError(null);
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
			setFetchedModels([]);
			setModelsError(result.error);
			setCredentialValidated(false);
			return;
		}

		setFetchedModels(result.data.models);
		const hasTypedKey = apiKeyInput.trim().length > 0;
		setCredentialValidated(
			result.data.models.length > 0 && (hasTypedKey || hasConfiguredCredential),
		);
	}, [
		apiKeyInput,
		baseUrlInput,
		canListModels,
		currentProvider,
		hasConfiguredCredential,
	]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void loadProviderModels();
		}, 450);

		return () => {
			window.clearTimeout(timer);
		};
	}, [loadProviderModels]);

	useEffect(() => {
		if (fetchedModels.length === 0) {
			return;
		}

		const selectedExists = fetchedModels.some(
			(model) => model.id === selectedModelId,
		);
		if (!selectedExists) {
			onSelectedModelIdChange(fetchedModels[0]?.id ?? selectedModelId);
		}
	}, [fetchedModels, onSelectedModelIdChange, selectedModelId]);

	const savedBaseUrl =
		currentProvider === "opencode"
			? (providerConfig?.baseUrl ?? OPENCODE_PLAN_ZEN_URL)
			: (providerConfig?.baseUrl ?? "");

	const hasUnsavedChanges =
		apiKeyInput.trim().length > 0 ||
		baseUrlInput.trim() !== savedBaseUrl.trim() ||
		selectedModelId !== lastSavedModelId;

	const canSave =
		Boolean(selectedModelId) &&
		(currentProvider === "ollama" ||
			credentialValidated ||
			hasConfiguredCredential);

	const handleSave = useCallback(() => {
		if (!canSave || isSaving) {
			return;
		}

		startSave(async () => {
			const trimmedKey = apiKeyInput.trim();
			const result = await updateAiProviderSettingsAction({
				insightsDefaultModelId: selectedModelId,
				providers: {
					[currentProvider]: {
						...(trimmedKey ? { apiKey: trimmedKey } : {}),
						...(baseUrlInput.trim() ? { baseUrl: baseUrlInput.trim() } : {}),
					},
				},
			});

			if (result.success) {
				setLastSavedModelId(selectedModelId);
				setApiKeyInput("");
				toast.success(result.message ?? "Configurações salvas.");
				router.refresh();
				return;
			}

			toast.error(result.error ?? "Erro ao salvar configurações.");
		});
	}, [
		apiKeyInput,
		baseUrlInput,
		canSave,
		currentProvider,
		isSaving,
		router,
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
		onSelectedModelIdChange(modelId);
	};

	return {
		currentProvider,
		providerConfig,
		hasConfiguredCredential,
		apiKeyInput,
		setApiKeyInput,
		baseUrlInput,
		setBaseUrlInput,
		fetchedModels,
		isLoadingModels,
		modelsError,
		credentialValidated,
		handleProviderChange,
		handleModelSelect,
		handleSave,
		isSaving,
		canSave: canSave && hasUnsavedChanges,
	};
}
