"use client";

import { RiCheckLine } from "@remixicon/react";
import {
	getOpenCodePlanFromBaseUrl,
	OPENCODE_PLANS,
	type OpenCodePlanId,
} from "@/shared/lib/ai/opencode-plans";
import { cn } from "@/shared/utils/ui";

interface OpenCodePlanCardsProps {
	baseUrl: string;
	disabled?: boolean;
	onPlanChange: (baseUrl: string) => void;
}

export function OpenCodePlanCards({
	baseUrl,
	disabled,
	onPlanChange,
}: OpenCodePlanCardsProps) {
	const selectedPlan = getOpenCodePlanFromBaseUrl(baseUrl);

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{OPENCODE_PLANS.map((plan) => {
				const isSelected = selectedPlan === plan.id;

				return (
					<button
						key={plan.id}
						type="button"
						disabled={disabled}
						onClick={() => onPlanChange(plan.baseUrl)}
						className={cn(
							"group relative rounded-2xl border p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-70",
							isSelected &&
								"border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20",
						)}
					>
						<div className="flex items-start gap-3">
							<div
								className={cn(
									"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-transparent transition-colors",
									isSelected &&
										"border-primary bg-primary text-primary-foreground",
								)}
							>
								<RiCheckLine className="size-3" />
							</div>

							<div className="min-w-0 flex-1 space-y-1.5">
								<div className="flex items-center gap-2">
									<span className="font-semibold text-sm leading-none">
										{plan.name}
									</span>
									{plan.id === "zen" ? (
										<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
											Pay-per-use
										</span>
									) : (
										<span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
											Assinatura
										</span>
									)}
								</div>
								<p className="text-muted-foreground text-xs leading-relaxed">
									{plan.description}
								</p>
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}

export function getOpenCodePlanLabel(baseUrl: string): string {
	const planId: OpenCodePlanId = getOpenCodePlanFromBaseUrl(baseUrl);
	return OPENCODE_PLANS.find((plan) => plan.id === planId)?.name ?? "OpenCode";
}
