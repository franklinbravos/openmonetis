"use client";

import {
	type RemixiconComponentType,
	RiArrowRightSLine,
	RiChatAi3Line,
	RiEyeLine,
	RiFlashlightLine,
	RiLightbulbLine,
	RiRocketLine,
	RiSparklingLine,
} from "@remixicon/react";
import type React from "react";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import type {
	InsightCategoryId,
	InsightItem,
	InsightsResponse,
} from "@/shared/lib/schemas/insights";
import { INSIGHT_CATEGORIES } from "@/shared/lib/schemas/insights";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";
import { InsightItemDetailDialog } from "./insight-item-detail-dialog";

interface InsightsGridProps {
	insights: InsightsResponse;
	action?: React.ReactNode;
}

type SelectedInsight = {
	item: InsightItem;
	categoryId: InsightCategoryId;
	categoryTitle: string;
	iconClassName: string;
};

const CATEGORY_ICONS: Record<InsightCategoryId, RemixiconComponentType> = {
	behaviors: RiEyeLine,
	triggers: RiFlashlightLine,
	recommendations: RiLightbulbLine,
	improvements: RiRocketLine,
};

const CATEGORY_COLORS: Record<
	InsightCategoryId,
	{ titleText: string; chatAiIcon: string }
> = {
	behaviors: {
		titleText: "text-chart-4",
		chatAiIcon: "text-chart-4",
	},
	triggers: {
		titleText: "text-warning",
		chatAiIcon: "text-warning",
	},
	recommendations: {
		titleText: "text-info",
		chatAiIcon: "text-info",
	},
	improvements: {
		titleText: "text-positive",
		chatAiIcon: "text-positive",
	},
};

export function InsightsGrid({ insights, action }: InsightsGridProps) {
	const formattedPeriod = displayPeriod(insights.month);
	const [selectedInsight, setSelectedInsight] = useState<SelectedInsight | null>(
		null,
	);

	return (
		<div className="space-y-6">
			<Card className="overflow-hidden border-primary/10 bg-linear-to-br from-primary/10 via-card to-card">
				<CardContent className="px-4 py-1">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex gap-3">
							<div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<RiSparklingLine className="size-5" />
							</div>
							<div className="space-y-1">
								<p className="font-semibold text-lg tracking-tight">
									Análise pronta para {formattedPeriod}
								</p>
								<p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
									Organizamos os sinais mais relevantes do período em quatro
									blocos: comportamentos, gatilhos, recomendações e
									oportunidades de melhoria. Toque em um item para ver o
									detalhamento e os eventos relacionados.
								</p>
							</div>
						</div>
						{action && <div className="shrink-0">{action}</div>}
					</div>
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{insights.categories.map((categoryData) => {
					const categoryConfig = INSIGHT_CATEGORIES[categoryData.category];
					const colors = CATEGORY_COLORS[categoryData.category];
					const Icon = CATEGORY_ICONS[categoryData.category];

					return (
						<Card
							key={categoryData.category}
							className="relative overflow-hidden"
						>
							<CardHeader>
								<div className="flex items-center gap-2">
									<Icon className={cn("size-5", colors.chatAiIcon)} />
									<CardTitle className={cn("font-semibold", colors.titleText)}>
										{categoryConfig.title}
									</CardTitle>
								</div>
							</CardHeader>
							<CardContent>
								{categoryData.items.map((item, index) => (
									<button
										key={`${categoryData.category}-${index}`}
										type="button"
										onClick={() =>
											setSelectedInsight({
												item,
												categoryId: categoryData.category,
												categoryTitle: categoryConfig.title,
												iconClassName: colors.chatAiIcon,
											})
										}
										className={cn(
											"group flex w-full flex-1 items-start gap-2 border-b border-dashed py-2.5 text-left transition-colors last:border-0",
											"rounded-md hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
										)}
									>
										<RiChatAi3Line
											className={cn("mt-0.5 size-4 shrink-0", colors.chatAiIcon)}
										/>
										<span className="min-w-0 flex-1 text-sm leading-snug">
											{item.text}
										</span>
										<RiArrowRightSLine
											className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
											aria-hidden
										/>
									</button>
								))}
							</CardContent>
						</Card>
					);
				})}
			</div>

			<InsightItemDetailDialog
				item={selectedInsight?.item ?? null}
				categoryTitle={selectedInsight?.categoryTitle}
				iconClassName={selectedInsight?.iconClassName}
				open={selectedInsight !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedInsight(null);
					}
				}}
			/>
		</div>
	);
}
