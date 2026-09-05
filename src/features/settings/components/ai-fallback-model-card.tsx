"use client";

import { RiLifebuoyLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { updateAiProviderSettingsClient } from "@/features/settings/lib/settings-api-client";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";
import { getModelLabel } from "@/shared/lib/ai/model-config-helpers";
import type { AiFallbackSettingsView } from "@/shared/lib/ai/types";

const NONE_VALUE = "__none__";

type AiFallbackModelCardProps = {
	fallback: AiFallbackSettingsView;
	/** Modelos do provedor aberto acima; para outro provedor, troque o provedor lá. */
	availableModels: ListedProviderModel[];
	primaryModelId: string;
};

/**
 * Reserva da análise com IA. Fica recolhida atrás de um toggle porque é ajuste
 * de exceção, e separada do modelo principal de propósito: salvar a reserva não
 * deve trocar o modelo em uso, então dá para abrir outro provedor acima só para
 * enxergar a lista dele e escolher a reserva sem mexer no principal.
 */
export function AiFallbackModelCard({
	fallback,
	availableModels,
	primaryModelId,
}: AiFallbackModelCardProps) {
	const [enabled, setEnabled] = useState(fallback.enabled);
	const [modelId, setModelId] = useState(fallback.modelId ?? NONE_VALUE);
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState(fallback.baseUrl ?? "");
	const [feedback, setFeedback] = useState<string | null>(null);
	const [isSaving, startSaving] = useTransition();

	const hasModel = modelId !== NONE_VALUE;
	const willHaveOwnKey = apiKey.trim().length > 0 || fallback.hasOwnKey;
	const isSameAsPrimary = hasModel && modelId === primaryModelId;
	/** Mesmo modelo só faz sentido com chave própria — é o caso da segunda chave. */
	const blockedSameModel = isSameAsPrimary && !willHaveOwnKey;

	const savedLabel = fallback.modelId
		? getModelLabel(fallback.modelId, availableModels)
		: null;

	const options =
		fallback.modelId &&
		!availableModels.some((model) => model.id === fallback.modelId)
			? [
					{ id: fallback.modelId, name: savedLabel ?? fallback.modelId },
					...availableModels,
				]
			: availableModels;

	const handleSave = () => {
		setFeedback(null);
		startSaving(async () => {
			const result = await updateAiProviderSettingsClient({
				fallback: {
					enabled,
					modelId: hasModel ? modelId : null,
					apiKey: apiKey.trim() ? apiKey.trim() : undefined,
					baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
				},
			});

			if (result.success) {
				setApiKey("");
				setFeedback("Reserva salva.");
				return;
			}

			setFeedback(result.error ?? "Não foi possível salvar a reserva.");
		});
	};

	return (
		<Card>
			<CardContent className="space-y-3 px-4 py-4 sm:px-5">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-2">
						<RiLifebuoyLine
							className="size-4 shrink-0 text-primary"
							aria-hidden
						/>
						<div>
							<Label
								htmlFor="ai-fallback-enabled"
								className="font-medium text-sm"
							>
								Modelo de reserva
							</Label>
							<p className="text-muted-foreground text-xs">
								{enabled
									? "Entra quando o principal falha por cota ou indisponibilidade."
									: "Desligado: falha do modelo principal derruba a análise."}
							</p>
						</div>
					</div>
					<Switch
						id="ai-fallback-enabled"
						checked={enabled}
						onCheckedChange={(next) => {
							setEnabled(next);
							setFeedback(null);
						}}
						disabled={isSaving}
					/>
				</div>

				{enabled ? (
					<div className="space-y-3 border-t pt-3">
						<div className="space-y-1.5">
							<Label htmlFor="ai-fallback-model">Modelo</Label>
							<select
								id="ai-fallback-model"
								className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
								value={modelId}
								onChange={(event) => {
									setModelId(event.target.value);
									setFeedback(null);
								}}
								disabled={isSaving}
							>
								<option value={NONE_VALUE}>Selecione o modelo</option>
								{options.map((model) => (
									<option key={model.id} value={model.id}>
										{model.name}
									</option>
								))}
							</select>
							<p className="text-muted-foreground text-xs leading-relaxed">
								A lista traz os modelos do provedor aberto acima. Para usar
								outro provedor, troque o provedor lá, escolha aqui e salve — o
								modelo principal não muda.
							</p>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="ai-fallback-key">
								Chave da reserva{" "}
								<span className="font-normal text-muted-foreground">
									(opcional)
								</span>
							</Label>
							<Input
								id="ai-fallback-key"
								type="password"
								autoComplete="off"
								value={apiKey}
								onChange={(event) => {
									setApiKey(event.target.value);
									setFeedback(null);
								}}
								placeholder={
									fallback.hasOwnKey
										? "Chave salva (deixe em branco para manter)"
										: "Em branco usa a mesma chave do provedor"
								}
								disabled={isSaving}
							/>
							<p className="text-muted-foreground text-xs leading-relaxed">
								Preencha para usar uma segunda chave do mesmo provedor — é o que
								resolve cota semanal esgotada sem trocar de modelo. A chave fica
								criptografada no banco.
							</p>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="ai-fallback-base-url">
								URL base{" "}
								<span className="font-normal text-muted-foreground">
									(opcional)
								</span>
							</Label>
							<Input
								id="ai-fallback-base-url"
								value={baseUrl}
								onChange={(event) => {
									setBaseUrl(event.target.value);
									setFeedback(null);
								}}
								placeholder="Em branco usa a URL do provedor"
								disabled={isSaving}
							/>
						</div>

						{blockedSameModel ? (
							<p className="text-amber-700 text-xs leading-relaxed dark:text-amber-400">
								A reserva é o mesmo modelo principal e sem chave própria, então
								não teria efeito. Escolha outro modelo ou informe uma chave.
							</p>
						) : null}
					</div>
				) : null}

				<div className="flex items-center justify-between gap-3">
					{feedback ? (
						<p className="text-muted-foreground text-xs">{feedback}</p>
					) : (
						<span />
					)}
					<Button
						type="button"
						size="sm"
						onClick={handleSave}
						disabled={isSaving || blockedSameModel || (enabled && !hasModel)}
					>
						{isSaving ? "Salvando…" : "Salvar reserva"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
