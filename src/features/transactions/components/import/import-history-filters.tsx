"use client";

import { RiCloseLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import type { SelectOption } from "@/features/transactions/components/types";
import { PeriodPicker } from "@/shared/components/period-picker";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";

type ImportHistoryFiltersProps = {
	cardOptions: SelectOption[];
	cardId: string | null;
	invoicePeriod: string | null;
};

function buildHistoryHref(
	cardId: string | null,
	invoicePeriod: string | null,
): string {
	const params = new URLSearchParams();
	if (cardId) params.set("cartao", cardId);
	if (invoicePeriod) params.set("periodo", invoicePeriod);
	const query = params.toString();
	return query
		? `/transactions/import/history?${query}`
		: "/transactions/import/history";
}

export function ImportHistoryFilters({
	cardOptions,
	cardId,
	invoicePeriod,
}: ImportHistoryFiltersProps) {
	const router = useRouter();
	const hasFilters = Boolean(cardId || invoicePeriod);

	const navigate = (nextCardId: string | null, nextPeriod: string | null) => {
		router.push(buildHistoryHref(nextCardId, nextPeriod));
	};

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
			<div className="space-y-1.5">
				<Label htmlFor="import-history-card">Cartão</Label>
				<Select
					value={cardId ?? "all"}
					onValueChange={(value) =>
						navigate(value === "all" ? null : value, invoicePeriod)
					}
				>
					<SelectTrigger id="import-history-card" className="w-full sm:w-56">
						<SelectValue placeholder="Todos os cartões" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos os cartões</SelectItem>
						{cardOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-1.5">
				<Label>Período da fatura</Label>
				<div className="flex items-center gap-1">
					<PeriodPicker
						value={invoicePeriod ?? ""}
						onChange={(period) => navigate(cardId, period)}
						placeholder="Todos os períodos"
						className="w-full sm:w-56"
					/>
					{invoicePeriod ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-9 shrink-0"
							aria-label="Limpar período"
							onClick={() => navigate(cardId, null)}
						>
							<RiCloseLine className="size-4" aria-hidden />
						</Button>
					) : null}
				</div>
			</div>

			{hasFilters ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="w-full sm:w-auto"
					onClick={() => navigate(null, null)}
				>
					Limpar filtros
				</Button>
			) : null}
		</div>
	);
}
