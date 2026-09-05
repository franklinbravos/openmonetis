"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { cn } from "@/shared/utils/ui";

export type SeriesEditScope = "single" | "future" | "all";

type SeriesEditScopeDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	seriesType: "installment" | "recurring";
	currentNumber?: number;
	totalCount?: number;
	onConfirm: (scope: SeriesEditScope) => void;
};

export function SeriesEditScopeDialog({
	open,
	onOpenChange,
	seriesType,
	currentNumber,
	totalCount,
	onConfirm,
}: SeriesEditScopeDialogProps) {
	const [scope, setScope] = useState<SeriesEditScope>("single");

	const seriesLabel =
		seriesType === "installment" ? "parcelamento" : "recorrência";

	const isKnownFirst =
		currentNumber != null ? currentNumber <= 1 : false;
	const showFutureOption = !isKnownFirst && (totalCount ?? 0) > 1;

	useEffect(() => {
		if (open) {
			setScope("single");
		}
	}, [open]);

	const handleConfirm = () => {
		onConfirm(scope);
		onOpenChange(false);
	};

	const installmentHint =
		seriesType === "installment" && currentNumber && totalCount
			? ` (${currentNumber}/${totalCount})`
			: "";

	const futureLabel = (() => {
		if (seriesType === "installment" && currentNumber && totalCount) {
			const remaining = totalCount - currentNumber + 1;
			return `Este e as próximas parcelas (${remaining} ${
				remaining === 1 ? "parcela" : "parcelas"
			})`;
		}
		return "Este e os próximos lançamentos";
	})();

	const futureDescription = (() => {
		if (seriesType === "installment") {
			return "Altera a parcela selecionada e todas as posteriores, sem mexer nas anteriores.";
		}
		return "Altera o mês selecionado e todos os posteriores na recorrência.";
	})();

	const allLabel =
		seriesType === "installment" && totalCount
			? `Toda a série desde a primeira parcela (${totalCount} ${
					totalCount === 1 ? "parcela" : "parcelas"
				})`
			: "Toda a série desde o primeiro lançamento";

	const allDescription =
		seriesType === "installment"
			? "Reaplica a configuração geral — valor, parcelas e forma de pagamento — em todos os itens da série."
			: `Reaplica os mesmos campos em todos os lançamentos desta recorrência${
					totalCount ? ` (${totalCount} no total)` : ""
				}.`;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Como deseja alterar?</DialogTitle>
					<DialogDescription>
						Este lançamento faz parte de um {seriesLabel}
						{installmentHint}. Escolha se a alteração vale só para este registro,
						a partir dele ou para toda a série desde o primeiro.
					</DialogDescription>
				</DialogHeader>

				<RadioGroup
					value={scope}
					onValueChange={(value) => setScope(value as SeriesEditScope)}
				>
					<div className="space-y-3">
						<label
							htmlFor="series-single"
							className={cn(
								"flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
								scope === "single"
									? "border-primary/30 bg-primary/5"
									: "border-border hover:bg-muted/40",
							)}
						>
							<RadioGroupItem
								value="single"
								id="series-single"
								className="mt-0.5"
							/>
							<div className="min-w-0 flex-1">
								<span className="block text-sm font-medium">
									Apenas este lançamento
								</span>
								<p className="text-xs text-muted-foreground">
									Altera somente a parcela ou o mês selecionado, sem mexer nos
									demais.
								</p>
							</div>
						</label>

						{showFutureOption ? (
							<label
								htmlFor="series-future"
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
									scope === "future"
										? "border-primary/30 bg-primary/5"
										: "border-border hover:bg-muted/40",
								)}
							>
								<RadioGroupItem
									value="future"
									id="series-future"
									className="mt-0.5"
								/>
								<div className="min-w-0 flex-1">
									<span className="block text-sm font-medium">
										{futureLabel}
									</span>
									<p className="text-xs text-muted-foreground">
										{futureDescription}
									</p>
								</div>
							</label>
						) : null}

						<label
							htmlFor="series-all"
							className={cn(
								"flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
								scope === "all"
									? "border-primary/30 bg-primary/5"
									: "border-border hover:bg-muted/40",
							)}
						>
							<RadioGroupItem value="all" id="series-all" className="mt-0.5" />
							<div className="min-w-0 flex-1">
								<span className="block text-sm font-medium">{allLabel}</span>
								<p className="text-xs text-muted-foreground">
									{allDescription}
								</p>
							</div>
						</label>
					</div>
				</RadioGroup>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleConfirm}>
						Continuar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
