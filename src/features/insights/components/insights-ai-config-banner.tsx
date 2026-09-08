"use client";

import { RiArrowRightLine, RiSparklingLine } from "@remixicon/react";
import Link from "next/link";
import { getInsightsAiConfigState } from "@/features/insights/lib/insights-ai-config";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";
import { cn } from "@/shared/utils/ui";

type InsightsAiConfigBannerProps = {
	selectedModelId: string;
	providerSettings?: AiProviderSettingsView["providers"];
	className?: string;
};

export function InsightsAiConfigBanner({
	selectedModelId,
	providerSettings,
	className,
}: InsightsAiConfigBannerProps) {
	const {
		isConfigured,
		providerName,
		selectedModelLabel,
		hasInvalidKey,
	} = getInsightsAiConfigState(selectedModelId, providerSettings);

	if (!isConfigured) {
		return null;
	}

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-sm",
				className,
			)}
		>
			<p className="flex min-w-0 items-center gap-2 text-muted-foreground">
				<RiSparklingLine className="size-4 shrink-0 text-primary" aria-hidden />
				<span className="truncate">
					Modelo{" "}
					<strong className="font-medium text-foreground">{providerName}</strong>
					{" · "}
					{selectedModelLabel}
					{hasInvalidKey ? " · chave ilegível" : ""}
				</span>
			</p>
			<Link
				href="/settings?aba=ia"
				className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
			>
				Alterar em Ajustes
				<RiArrowRightLine className="size-3.5" aria-hidden />
			</Link>
		</div>
	);
}
