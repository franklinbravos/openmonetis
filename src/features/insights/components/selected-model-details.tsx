"use client";

import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react";
import { getOpenCodePlanLabel } from "@/features/insights/components/opencode-plan-cards";
import type { AIProvider } from "@/features/insights/constants";
import { Badge } from "@/shared/components/ui/badge";
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";
import { stripCustomProviderPrefix } from "@/shared/lib/ai/model-config-helpers";
import { cn } from "@/shared/utils/ui";

interface SelectedModelDetailsProps {
	model: ListedProviderModel | null;
	currentProvider: AIProvider;
	baseUrl?: string;
	isSavedInDatabase: boolean;
	hasUnsavedChanges: boolean;
}

function formatMetadataValue(value: unknown): string {
	if (value == null) return "—";
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

export function SelectedModelDetails({
	model,
	currentProvider,
	baseUrl,
	isSavedInDatabase,
	hasUnsavedChanges,
}: SelectedModelDetailsProps) {
	if (!model) {
		return (
			<div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-muted-foreground text-xs">
				Selecione um modelo para ver os detalhes retornados pelo provedor.
			</div>
		);
	}

	const metadataEntries = Object.entries(model.metadata ?? {}).filter(
		([key]) => key !== "source",
	);

	return (
		<div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
			<div className="flex flex-wrap items-center gap-2">
				<p className="font-medium text-sm">Modelo selecionado</p>
				{model.isFreeTier ? (
					<Badge variant="outline" className="text-[10px]">
						Grátis
					</Badge>
				) : null}
				{model.unavailableInCatalog ? (
					<Badge variant="destructive" className="text-[10px]">
						Fora do catálogo atual
					</Badge>
				) : null}
				{isSavedInDatabase && !hasUnsavedChanges ? (
					<span className="inline-flex items-center gap-1 text-emerald-600 text-xs dark:text-emerald-400">
						<RiCheckLine className="size-3.5" />
						Salvo no banco
					</span>
				) : (
					<span className="inline-flex items-center gap-1 text-amber-700 text-xs dark:text-amber-400">
						<RiErrorWarningLine className="size-3.5" />
						Alteração não salva — clique em Salvar
					</span>
				)}
			</div>

			<dl className="grid gap-2 text-xs sm:grid-cols-2">
				<div>
					<dt className="text-muted-foreground">Nome</dt>
					<dd className="font-medium">{model.name}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">ID completo</dt>
					<dd className="break-all font-mono">{model.id}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">Provedor</dt>
					<dd className="font-medium capitalize">{currentProvider}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground">ID no provedor</dt>
					<dd className="break-all font-mono">
						{stripCustomProviderPrefix(model.id, currentProvider)}
					</dd>
				</div>
				{currentProvider === "opencode" && baseUrl ? (
					<div className="sm:col-span-2">
						<dt className="text-muted-foreground">Plano OpenCode</dt>
						<dd className="font-medium">{getOpenCodePlanLabel(baseUrl)}</dd>
					</div>
				) : null}
			</dl>

			{model.unavailableInCatalog ? (
				<p className="text-amber-800 text-xs dark:text-amber-300">
					Este modelo não apareceu na listagem do plano atual. Troque o plano,
					escolha outro modelo ou salve novamente após validar a chave.
				</p>
			) : null}

			{metadataEntries.length > 0 ? (
				<div className="space-y-2">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Dados do provedor
					</p>
					<dl className="grid gap-2 rounded-lg border border-border/60 bg-background/80 p-3 text-xs">
						{metadataEntries.map(([key, value]) => (
							<div key={key} className="grid gap-0.5 sm:grid-cols-[140px_1fr]">
								<dt className="text-muted-foreground">{key}</dt>
								<dd className={cn("break-all font-mono")}>
									{formatMetadataValue(value)}
								</dd>
							</div>
						))}
					</dl>
				</div>
			) : null}
		</div>
	);
}
