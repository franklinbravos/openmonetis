"use client";

import { RiInformationLine } from "@remixicon/react";
import { useState } from "react";
import { ModelSelectionCard } from "@/features/insights/components/model-selection-card";
import { ProviderSelectionCard } from "@/features/insights/components/provider-selection-card";
import { DEFAULT_MODEL } from "@/features/insights/constants";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";
import { useAiModelConfiguration } from "../hooks/use-ai-model-configuration";

interface AiModelConfigurationProps {
	settings: AiProviderSettingsView;
}

export function AiModelConfiguration({ settings }: AiModelConfigurationProps) {
	const [selectedModelId, setSelectedModelId] = useState(
		settings.insightsDefaultModelId ?? DEFAULT_MODEL,
	);

	const {
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
		canSave,
	} = useAiModelConfiguration({
		settings,
		selectedModelId,
		onSelectedModelIdChange: setSelectedModelId,
	});

	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-border/70 bg-muted/30 p-4">
				<div className="flex gap-3">
					<RiInformationLine className="mt-0.5 size-4 shrink-0 text-primary" />
					<div className="space-y-1 text-sm">
						<p className="font-medium">Como funciona</p>
						<p className="text-muted-foreground leading-relaxed">
							As chaves salvas aqui ficam criptografadas no banco e têm
							prioridade sobre o arquivo <code>.env</code>. Escolha o provedor,
							valide a chave, selecione o modelo e clique em Salvar para usar
							essas configurações na página de Insights.
						</p>
					</div>
				</div>
			</div>

			<div className="space-y-4">
				<ProviderSelectionCard
					variant="settings"
					currentProvider={currentProvider}
					onProviderChange={handleProviderChange}
				/>

				<ModelSelectionCard
					variant="settings"
					currentProvider={currentProvider}
					providerModels={fetchedModels}
					apiKey={apiKeyInput}
					onApiKeyChange={setApiKeyInput}
					baseUrl={baseUrlInput}
					onBaseUrlChange={setBaseUrlInput}
					configuredKeyHint={providerConfig?.apiKeyHint ?? null}
					hasConfiguredCredential={hasConfiguredCredential}
					credentialValidated={credentialValidated}
					isLoadingModels={isLoadingModels}
					modelsError={modelsError}
					selectValue={selectedModelId}
					onModelSelect={handleModelSelect}
					onSave={handleSave}
					isSaving={isSaving}
					canSave={canSave}
				/>
			</div>
		</div>
	);
}
