"use client";

import { RiChatAi3Line } from "@remixicon/react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import type { InsightEvent, InsightItem } from "@/shared/lib/schemas/insights";
import { cn } from "@/shared/utils/ui";

type InsightItemDetailDialogProps = {
	item: InsightItem | null;
	categoryTitle?: string;
	iconClassName?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function InsightEventsList({ events }: { events: InsightEvent[] }) {
	return (
		<ul className="space-y-2">
			{events.map((event, index) => (
				<li
					key={`${event.label}-${index}`}
					className="flex items-start justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
				>
					<span className="text-sm leading-snug">{event.label}</span>
					{event.value ? (
						<span className="shrink-0 text-sm font-medium tabular-nums">
							{event.value}
						</span>
					) : null}
				</li>
			))}
		</ul>
	);
}

export function InsightItemDetailDialog({
	item,
	categoryTitle,
	iconClassName,
	open,
	onOpenChange,
}: InsightItemDetailDialogProps) {
	if (!item) {
		return null;
	}

	const hasDetail = Boolean(item.detail?.trim());
	const hasEvents = Boolean(item.events && item.events.length > 0);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div
							className={cn(
								"flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted",
								iconClassName,
							)}
						>
							<RiChatAi3Line className="size-4" />
						</div>
						<div className="min-w-0 space-y-1">
							{categoryTitle ? (
								<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									{categoryTitle}
								</p>
							) : null}
							<DialogTitle className="text-left text-base leading-snug">
								{item.text}
							</DialogTitle>
							<DialogDescription className="sr-only">
								Detalhamento e eventos relacionados ao insight
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-5">
					<section className="space-y-2">
						<h3 className="text-sm font-medium">Detalhamento</h3>
						{hasDetail ? (
							<p className="text-sm leading-relaxed text-muted-foreground">
								{item.detail}
							</p>
						) : (
							<p className="text-sm text-muted-foreground">
								Este insight foi gerado em uma versão anterior. Gere novamente a
								análise para ver o detalhamento completo.
							</p>
						)}
					</section>

					{hasEvents ? (
						<section className="space-y-2">
							<h3 className="text-sm font-medium">Eventos relacionados</h3>
							<InsightEventsList events={item.events ?? []} />
						</section>
					) : (
						<section className="space-y-2">
							<h3 className="text-sm font-medium">Eventos relacionados</h3>
							<p className="text-sm text-muted-foreground">
								Nenhum evento vinculado. Gere novamente os insights para ver as
								evidências dos dados.
							</p>
						</section>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
