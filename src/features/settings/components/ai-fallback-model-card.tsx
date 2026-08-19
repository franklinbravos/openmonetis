"use client";

import { RiLifebuoyLine } from "@remixicon/react";
import { useState, useTransition } from "react";
import { updateAiProviderSettingsAction } from "@/features/settings/actions/ai-providers";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Label } from "@/shared/components/ui/label";
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";
import { getModelLabel } from "@/shared/lib/ai/model-config-helpers";

const NONE_VALUE = "__none__";

type AiFallbackModelCardProps = {
	savedFallbackModelId: string | null;
	/** Modelos do provedor aberto na tela; para outro provedor, troque o provedor acima. */
	availableModels: ListedProviderModel[];
	primaryModelId: string;
};

/**
 * Modelo de reserva da análise com IA. Fica separado do modelo principal de
 * propósito: salvar a reserva não deve mexer no modelo que está em uso, e assim
 * dá para trocar o provedor acima só para enxergar a lista dele, escolher a
 * reserva e salvar sem trocar o principal.
 */
export function AiFallbackModelCard({
	savedFallbackModelId,
	availableModels,
	primaryModelId,
}: AiFallbackModelCardProps) {
	const [selected, setSelected] = useState(savedFallbackModelId ?? NONE_VALUE);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [isSaving, startSaving] = useTransition();

	const savedLabel = savedFallbackModelId
		? getModelLabel(savedFallbackModelId, availableModels)
		: null;
	const isSameAsPrimary =
		selected !== NONE_VALUE && selected === primaryModelId;
	const hasChanges = selected !== (savedFallbackModelId ?? NONE_VALUE);

	const options = availableModels.some(
		(model) => model.id === savedFallbackModelId,
	)
		? availableModels
		: savedFallbackModelId
			? [
					{
						id: savedFallbackModelId,
						name: savedLabel ?? savedFallbackModelId,
					},
					...availableModels,
				]
			: availableModels;

	const handleSave = () => {
		setFeedback(null);
		startSaving(async () => {
			const result = await updateAiProviderSettingsAction({
				aiFallbackModelId: selected === NONE_VALUE ? null : selected,
			});
			setFeedback(
				result.success
					? "Modelo de reserva salvo."
					: (result.error ?? "Não foi possível salvar o modelo de reserva."),
			);
		});
	};

	return (
		<Card>
			<CardContent className="space-y-3 px-4 py-4 sm:px-5">
				<div className="flex items-center gap-2">
					<RiLifebuoyLine
						className="size-4 shrink-0 text-primary"
						aria-hidden
					/>
					<p className="font-medium text-sm">Modelo de reserva</p>
				</div>

				<p className="text-muted-foreground text-xs leading-relaxed">
					Usado quando o modelo principal falha por cota esgotada,
					indisponibilidade ou por não suportar a análise. Chave rejeitada não
					cai para a reserva — isso é erro de configuração e precisa aparecer.
				</p>

				<div className="space-y-1.5">
					<Label htmlFor="ai-fallback-model">Modelo</Label>
					<select
						id="ai-fallback-model"
						className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
						value={selected}
						onChange={(event) => {
							setSelected(event.target.value);
							setFeedback(null);
						}}
						disabled={isSaving}
					>
						<option value={NONE_VALUE}>Sem reserva</option>
						{options.map((model) => (
							<option key={model.id} value={model.id}>
								{model.name}
							</option>
						))}
					</select>
					<p className="text-muted-foreground text-xs leading-relaxed">
						A lista mostra os modelos do provedor aberto acima. Para usar outro
						provedor como reserva, troque o provedor, escolha o modelo aqui e
						salve — o modelo principal não muda.
					</p>
				</div>

				{isSameAsPrimary ? (
					<p className="text-amber-700 text-xs dark:text-amber-400">
						A reserva é o mesmo modelo principal, então não terá efeito. Escolha
						um modelo diferente.
					</p>
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
						disabled={isSaving || !hasChanges || isSameAsPrimary}
					>
						{isSaving ? "Salvando…" : "Salvar reserva"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
