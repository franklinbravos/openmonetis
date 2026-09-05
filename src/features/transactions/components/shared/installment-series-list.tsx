"use client";

import { RiAlertLine, RiCheckLine, RiFlashlightLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import type { InstallmentSeriesOccurrence } from "@/features/transactions/actions/installment-series";
import { fetchInstallmentSeriesClient } from "@/features/transactions/lib/transactions-api-client";
import {
	currencyFormatter,
	formatPeriod,
} from "@/features/transactions/lib/formatting-helpers";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";

interface InstallmentSeriesListProps {
	seriesId: string;
	currentTransactionId: string;
	installmentCount: number;
	/** Abre a edição da parcela escolhida. Sem isso a lista é só de leitura. */
	onEditOccurrence?: (transactionId: string) => void;
}

function toNumber(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Valor que a maior parte das parcelas tem.
 *
 * A referência é a moda, não a média: uma parcela digitada errada puxaria a
 * média e faria todas as outras parecerem divergentes.
 */
function resolveReferenceAmount(occurrences: InstallmentSeriesOccurrence[]) {
	const tally = new Map<number, number>();

	for (const occurrence of occurrences) {
		const amount = Math.abs(toNumber(occurrence.amount));
		tally.set(amount, (tally.get(amount) ?? 0) + 1);
	}

	let reference = 0;
	let best = 0;
	for (const [amount, count] of tally) {
		if (count > best) {
			best = count;
			reference = amount;
		}
	}

	return reference;
}

export function InstallmentSeriesList({
	seriesId,
	currentTransactionId,
	installmentCount,
	onEditOccurrence,
}: InstallmentSeriesListProps) {
	const [occurrences, setOccurrences] = useState<
		InstallmentSeriesOccurrence[] | null
	>(null);

	useEffect(() => {
		let cancelled = false;
		setOccurrences(null);

		void fetchInstallmentSeriesClient(seriesId).then((rows) => {
			if (cancelled) return;
			setOccurrences(rows);
		});

		return () => {
			cancelled = true;
		};
	}, [seriesId]);

	if (occurrences === null) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
			</div>
		);
	}

	if (occurrences.length === 0) return null;

	const referenceAmount = resolveReferenceAmount(occurrences);
	const total = occurrences.reduce(
		(sum, occurrence) => sum + Math.abs(toNumber(occurrence.amount)),
		0,
	);
	const missingCount = Math.max(0, installmentCount - occurrences.length);

	return (
		<div className="space-y-2">
			<ul className="min-w-0 divide-y rounded-lg border">
				{occurrences.map((occurrence) => {
					const amount = Math.abs(toNumber(occurrence.amount));
					const isCurrent = occurrence.id === currentTransactionId;
					const divergesFromSeries =
						referenceAmount > 0 && Math.abs(amount - referenceAmount) > 0.005;

					return (
						<li
							key={occurrence.id}
							className={`flex min-w-0 items-center gap-2 px-3 py-2 ${
								isCurrent ? "bg-muted/60" : ""
							}`}
						>
							<span className="w-12 shrink-0 text-muted-foreground text-xs tabular-nums">
								{occurrence.currentInstallment ?? "—"}/{installmentCount}
							</span>

							<span className="min-w-0 flex-1 truncate text-xs">
								{formatPeriod(occurrence.period)}
							</span>

							{occurrence.isAnticipated && (
								<RiFlashlightLine
									className="size-3.5 shrink-0 text-warning"
									aria-label="Antecipada"
								/>
							)}

							{occurrence.isSettled && (
								<RiCheckLine
									className="size-3.5 shrink-0 text-positive"
									aria-label="Paga"
								/>
							)}

							<span
								className={`shrink-0 tabular-nums text-xs ${
									divergesFromSeries ? "font-semibold text-warning" : ""
								}`}
								title={
									divergesFromSeries
										? `Difere das demais (${currencyFormatter.format(referenceAmount)})`
										: undefined
								}
							>
								{currencyFormatter.format(amount)}
							</span>

							{onEditOccurrence && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 shrink-0 px-2 text-xs"
									onClick={() => onEditOccurrence(occurrence.id)}
								>
									Alterar
								</Button>
							)}
						</li>
					);
				})}
			</ul>

			<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
				<span className="text-muted-foreground">
					{occurrences.length} de {installmentCount} parcelas
				</span>
				<span className="tabular-nums">
					Soma: {currencyFormatter.format(total)}
				</span>
			</div>

			{missingCount > 0 && (
				<Badge
					variant="outline"
					className="gap-1 border-warning/40 text-warning"
				>
					<RiAlertLine className="size-3" />
					{missingCount === 1
						? "1 parcela não está cadastrada"
						: `${missingCount} parcelas não estão cadastradas`}
				</Badge>
			)}
		</div>
	);
}
