"use client";

import { RiArrowRightLine, RiSparklingLine } from "@remixicon/react";
import Link from "next/link";
import { AnalysisSummaryCard } from "@/features/insights/components/analysis-summary-card";
import {
	type AIProvider,
	DEFAULT_MODEL,
	PROVIDERS,
} from "@/features/insights/constants";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	getModelLabel,
	getProviderFromModelId,
} from "@/shared/lib/ai/model-config-helpers";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";

interface InsightsGeneratePanelProps {
	period: string;
	selectedModelId: string;
	providerSettings?: AiProviderSettingsView["providers"];
	userInstructions: string;
	onUserInstructionsChange: (value: string) => void;
	onAnalyze: () => void;
	disabled?: boolean;
	isLoadingSavedInsights?: boolean;
}

export function InsightsGeneratePanel({
	period,
	selectedModelId,
	providerSettings,
	userInstructions,
	onUserInstructionsChange,
	onAnalyze,
	disabled,
	isLoadingSavedInsights,
}: InsightsGeneratePanelProps) {
	const currentProvider =
		(getProviderFromModelId(selectedModelId) as AIProvider | null) ?? "openai";
	const selectedModelLabel = getModelLabel(selectedModelId);
	const providerConfig = providerSettings?.[currentProvider];
	const hasInvalidKey = providerConfig?.hasInvalidDatabaseKey ?? false;
	const hasCredential =
		providerConfig?.activeSource !== "none" && !hasInvalidKey;
	const canAnalyze =
		!disabled &&
		!isLoadingSavedInsights &&
		Boolean(selectedModelId) &&
		(currentProvider === "ollama" || hasCredential);

	return (
		<section className="space-y-4">
			<Card className="border-border/70 bg-card/95 shadow-sm">
				<CardContent className="space-y-4">
					<div className="space-y-1">
						<h2 className="font-semibold text-2xl tracking-tight">
							Gerar insights
						</h2>
						<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
							A configuração de provedor, chave de API e modelo foi movida para{" "}
							<strong>Ajustes → Inteligência artificial</strong>. Lá você
							escolhe o provedor, valida a chave e define o modelo padrão usado
							nesta análise.
						</p>
					</div>

					<Button asChild className="w-fit">
						<Link href="/settings?aba=ia">
							Configurar modelo de IA
							<RiArrowRightLine className="size-4" />
						</Link>
					</Button>

					<div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
						<p className="font-medium">Configuração atual</p>
						<p className="mt-1 text-muted-foreground">
							<strong>{PROVIDERS[currentProvider].name}</strong>
							{" · "}
							{selectedModelLabel || DEFAULT_MODEL}
							{hasInvalidKey
								? " · chave ilegível — salve novamente em Ajustes"
								: hasCredential
									? " · chave configurada"
									: " · sem chave configurada"}
						</p>
					</div>
				</CardContent>
			</Card>

			<div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
				<Card className="border-border/70 bg-card/95 shadow-sm">
					<CardContent className="flex flex-col gap-4 py-6">
						<div className="space-y-1">
							<h3 className="font-semibold text-sm">Executar análise</h3>
							<p className="text-muted-foreground text-xs">
								Gera os insights do período com o modelo configurado em Ajustes.
							</p>
						</div>
						<Button
							onClick={onAnalyze}
							disabled={!canAnalyze}
							className="w-fit"
						>
							<RiSparklingLine className="size-4" />
							{disabled ? "Analisando..." : "Gerar insights"}
						</Button>
					</CardContent>
				</Card>

				<AnalysisSummaryCard
					period={period}
					currentProvider={currentProvider}
					selectedModelLabel={selectedModelLabel}
					userInstructions={userInstructions}
					onUserInstructionsChange={onUserInstructionsChange}
				/>
			</div>
		</section>
	);
}
