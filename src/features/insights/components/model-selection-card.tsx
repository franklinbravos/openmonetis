import {
	RiCheckLine,
	RiExternalLinkLine,
	RiRefreshLine,
	RiSaveLine,
	RiSparklingLine,
} from "@remixicon/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AIProvider } from "@/features/insights/constants";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { getEnvVariableName } from "@/shared/lib/ai/env-credentials";
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";
import { cn } from "@/shared/utils/ui";
import { ModelSearchCombobox } from "./model-search-combobox";
import { OpenCodePlanCards } from "./opencode-plan-cards";
import { SelectedModelDetails } from "./selected-model-details";

interface ModelSelectionCardProps {
	currentProvider: AIProvider;
	providerModels: ListedProviderModel[];
	apiKey: string;
	onApiKeyChange: (value: string) => void;
	baseUrl: string;
	onBaseUrlChange: (value: string) => void;
	configuredKeyHint: string | null;
	hasConfiguredCredential: boolean;
	credentialValidated: boolean;
	isLoadingModels: boolean;
	modelsError: string | null;
	canAnalyze?: boolean;
	disabled?: boolean;
	selectValue: string;
	selectedModel?: ListedProviderModel | null;
	onModelSelect: (modelId: string) => void;
	isSavedInDatabase?: boolean;
	hasUnsavedChanges?: boolean;
	onCancel?: () => void;
	onAnalyze?: () => void;
	onSave?: () => void;
	onTest?: () => void;
	canTest?: boolean;
	isSaving?: boolean;
	canSave?: boolean;
	variant?: "insights" | "settings";
}

function providerShowsApiKey(provider: AIProvider) {
	return provider !== "ollama";
}

export function ModelSelectionCard({
	currentProvider,
	providerModels,
	apiKey,
	onApiKeyChange,
	baseUrl,
	onBaseUrlChange,
	configuredKeyHint,
	hasConfiguredCredential,
	credentialValidated,
	isLoadingModels,
	modelsError,
	canAnalyze,
	disabled,
	selectValue,
	selectedModel = null,
	onModelSelect,
	isSavedInDatabase = false,
	hasUnsavedChanges = false,
	onCancel,
	onAnalyze,
	onSave,
	onTest,
	canTest = false,
	isSaving,
	canSave,
	variant = "insights",
}: ModelSelectionCardProps) {
	const isSettings = variant === "settings";
	const showsApiKey = providerShowsApiKey(currentProvider);
	const envVariableName = getEnvVariableName(currentProvider);
	const [isEditingApiKey, setIsEditingApiKey] = useState(false);

	useEffect(() => {
		if (currentProvider || configuredKeyHint) {
			setIsEditingApiKey(false);
		}
	}, [currentProvider, configuredKeyHint]);

	const hasSavedKeyHint = Boolean(configuredKeyHint);
	const isShowingSavedKeyHint =
		hasSavedKeyHint && !apiKey.trim() && !isEditingApiKey;
	const apiKeyDisplayValue = isShowingSavedKeyHint
		? (configuredKeyHint ?? "")
		: apiKey;
	const canListModels =
		currentProvider === "ollama" ||
		currentProvider === "opencode" ||
		apiKey.trim().length > 0 ||
		hasConfiguredCredential;

	return (
		<Card className="border-border/70 bg-card/95 shadow-sm">
			<CardContent className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-1">
						<h3 className="font-semibold text-sm">2. Modelo específico</h3>
						<p className="text-muted-foreground text-xs">
							{isSettings
								? "Informe a chave do provedor e escolha o modelo padrão dos insights."
								: "Informe a chave do provedor e escolha o modelo para esta análise."}
						</p>
					</div>

					{showsApiKey ? (
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="provider-api-key">Chave API</Label>
								{credentialValidated &&
								(apiKey.trim().length > 0 || hasConfiguredCredential) ? (
									<span className="inline-flex items-center gap-1 text-positive text-xs">
										<RiCheckLine className="size-3.5" />
										Chave validada
									</span>
								) : null}
							</div>
							<Input
								id="provider-api-key"
								type={isShowingSavedKeyHint ? "text" : "password"}
								value={apiKeyDisplayValue}
								onChange={(event) => {
									if (isShowingSavedKeyHint) {
										setIsEditingApiKey(true);
									}
									onApiKeyChange(event.target.value);
								}}
								onFocus={() => {
									if (hasSavedKeyHint && !apiKey.trim()) {
										setIsEditingApiKey(true);
									}
								}}
								onBlur={() => {
									if (!apiKey.trim()) {
										setIsEditingApiKey(false);
									}
								}}
								placeholder={
									isEditingApiKey
										? "Digite nova chave ou deixe em branco para manter"
										: isSettings
											? "Cole sua chave API"
											: envVariableName
												? `Cole sua chave ou configure ${envVariableName} no .env`
												: "Cole sua chave API"
								}
								disabled={disabled}
								className={cn(
									"h-9 w-full border-border/70 bg-background",
									isShowingSavedKeyHint && "font-mono text-muted-foreground",
								)}
								autoComplete="off"
							/>
							<p className="text-muted-foreground text-xs">
								{isSettings
									? "Valide a chave e clique em Salvar para persistir as alterações."
									: "A chave é salva automaticamente quando validada. Também é possível configurar em Ajustes → Inteligência artificial."}
							</p>
						</div>
					) : null}

					{currentProvider === "opencode" ? (
						<div className="space-y-2">
							<Label>Plano OpenCode</Label>
							<OpenCodePlanCards
								baseUrl={baseUrl}
								disabled={disabled}
								onPlanChange={onBaseUrlChange}
							/>
						</div>
					) : null}

					{currentProvider === "ollama" ? (
						<div className="space-y-2">
							<Label htmlFor="provider-base-url">URL da instância Ollama</Label>
							<Input
								id="provider-base-url"
								value={baseUrl}
								onChange={(event) => onBaseUrlChange(event.target.value)}
								placeholder="http://localhost:11434/v1"
								disabled={disabled}
								className="h-9 w-full border-border/70 bg-background"
							/>
						</div>
					) : null}

					<div className="space-y-2">
						<div className="flex items-center justify-between gap-2">
							<Label htmlFor="provider-model">Modelo</Label>
							{credentialValidated && providerModels.length > 0 ? (
								<span className="inline-flex items-center gap-1 text-positive text-xs">
									<RiCheckLine className="size-3.5" />
									{providerModels.length} modelos disponíveis
								</span>
							) : null}
						</div>
						{isLoadingModels ? (
							<Skeleton className="h-9 w-full" />
						) : (
							<ModelSearchCombobox
								id="provider-model"
								value={selectValue}
								models={providerModels}
								onValueChange={onModelSelect}
								disabled={
									disabled ||
									!canListModels ||
									(providerModels.length === 0 && isLoadingModels)
								}
								placeholder={
									canListModels
										? providerModels.length > 0
											? "Selecione um modelo"
											: isLoadingModels
												? "Carregando modelos..."
												: "Nenhum modelo disponível"
										: "Informe a chave API para listar modelos"
								}
								className={cn(credentialValidated && "border-positive/40")}
							/>
						)}

						<SelectedModelDetails
							model={selectedModel}
							currentProvider={currentProvider}
							baseUrl={baseUrl}
							isSavedInDatabase={isSavedInDatabase}
							hasUnsavedChanges={hasUnsavedChanges}
						/>

						{modelsError ? (
							<p className="text-destructive text-xs">{modelsError}</p>
						) : null}

						{currentProvider === "ollama" ? (
							<p className="text-muted-foreground text-xs">
								O modelo precisa estar instalado na instância Ollama
								configurada.
							</p>
						) : null}

						{currentProvider === "openrouter" ? (
							<Link
								href="https://openrouter.ai/models"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
							>
								<RiExternalLinkLine className="size-3" />
								Ver catálogo do OpenRouter
							</Link>
						) : null}
					</div>
				</div>

				{isSettings ? (
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={onTest}
							disabled={disabled || isSaving || isLoadingModels || !canTest}
						>
							<RiRefreshLine className="size-4" />
							{isLoadingModels ? "Testando…" : "Testar"}
						</Button>
						<Button
							type="button"
							onClick={onSave}
							disabled={disabled || isSaving || !canSave}
						>
							<RiSaveLine className="size-4" />
							{isSaving ? "Salvando..." : "Salvar"}
						</Button>
					</div>
				) : (
					<div className="flex items-center justify-between gap-3">
						<Button
							disabled={disabled}
							onClick={onCancel}
							type="button"
							variant="outline"
						>
							Cancelar
						</Button>
						<Button onClick={onAnalyze} disabled={!canAnalyze}>
							<RiSparklingLine className="size-4" />
							{disabled ? "Analisando..." : "Gerar insights"}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
