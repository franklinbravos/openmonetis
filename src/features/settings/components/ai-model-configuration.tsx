"use client";

import { RiErrorWarningLine, RiInformationLine } from "@remixicon/react";
import { useState } from "react";
import { ModelSelectionCard } from "@/features/insights/components/model-selection-card";
import { ProviderSelectionCard } from "@/features/insights/components/provider-selection-card";
import { DEFAULT_MODEL } from "@/features/insights/constants";
import { AiFallbackModelCard } from "@/features/settings/components/ai-fallback-model-card";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { AI_STORED_KEY_UNREADABLE_MESSAGE } from "@/shared/lib/ai/provider-messages";
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
		hasInvalidDatabaseKey,
		apiKeyInput,
		setApiKeyInput,
		baseUrlInput,
		setBaseUrlInput,
		fetchedModels,
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
		canSave,
		hasUnsavedChanges,
		isSavedInDatabase,
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
							As chaves salvas aqui ficam criptografadas no banco e são usadas
							em Insights, importação e demais recursos de IA. Escolha o
							provedor, valide a chave, selecione o modelo e clique em Salvar.
						</p>
					</div>
				</div>
			</div>

			{hasInvalidDatabaseKey ? (
				<Alert variant="destructive">
					<RiErrorWarningLine className="size-4" />
					<AlertDescription className="text-sm">
						{AI_STORED_KEY_UNREADABLE_MESSAGE}
					</AlertDescription>
				</Alert>
			) : null}

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
					selectedModel={selectedModel}
					onModelSelect={handleModelSelect}
					onSave={handleSave}
					onTest={handleTestCredential}
					canTest={canTestCredential}
					isSaving={isSaving}
					canSave={canSave}
					isSavedInDatabase={isSavedInDatabase}
					hasUnsavedChanges={hasUnsavedChanges}
				/>

				<AiFallbackModelCard
					fallback={settings.fallback}
					availableModels={fetchedModels}
					primaryModelId={selectedModelId}
				/>
			</div>
		</div>
	);
}
