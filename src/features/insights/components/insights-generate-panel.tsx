"use client";

import { RiArrowRightLine, RiSparklingLine } from "@remixicon/react";
import Link from "next/link";
import { AnalysisSummaryCard } from "@/features/insights/components/analysis-summary-card";
import { DEFAULT_MODEL } from "@/features/insights/constants";
import { getInsightsAiConfigState } from "@/features/insights/lib/insights-ai-config";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
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
	const {
		currentProvider,
		selectedModelLabel,
		hasInvalidKey,
		hasCredential,
		isConfigured,
		providerName,
	} = getInsightsAiConfigState(selectedModelId, providerSettings);

	const canAnalyze =
		!disabled &&
		!isLoadingSavedInsights &&
		Boolean(selectedModelId) &&
		(currentProvider === "ollama" || hasCredential);

	return (
		<section className="space-y-4">
			{!isConfigured ? (
				<Card className="border-border/70 bg-card/95 shadow-sm">
					<CardContent className="space-y-4">
						<div className="space-y-1">
							<h2 className="font-semibold text-2xl tracking-tight">
								Configurar IA
							</h2>
							<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
								Para gerar insights, configure o provedor, a chave de API e o
								modelo em{" "}
								<strong>Ajustes → Inteligência artificial</strong>.
							</p>
						</div>

						<Button asChild className="w-fit">
							<Link href="/settings?aba=ia">
								Configurar modelo de IA
								<RiArrowRightLine className="size-4" />
							</Link>
						</Button>

						<div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
							<p className="font-medium">Status</p>
							<p className="mt-1 text-muted-foreground">
								<strong>{providerName}</strong>
								{" · "}
								{selectedModelLabel || DEFAULT_MODEL}
								{hasInvalidKey
									? " · chave ilegível — salve novamente em Ajustes"
									: " · sem chave configurada"}
							</p>
						</div>
					</CardContent>
				</Card>
			) : null}

			<div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
				<Card className="border-border/70 bg-card/95 shadow-sm">
					<CardContent className="flex flex-col gap-4 py-6">
						<div className="space-y-1">
							<h2 className="font-semibold text-lg tracking-tight">
								Gerar insights
							</h2>
							<p className="text-muted-foreground text-sm">
								{isConfigured
									? "Analise o período selecionado com o modelo configurado."
									: "Configure a IA em Ajustes para habilitar a análise."}
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
