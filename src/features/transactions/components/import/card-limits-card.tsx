"use client";

import { RiCheckboxCircleLine, RiInformationLine } from "@remixicon/react";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

type CardLimitsCardProps = {
	/** Limite total lido do arquivo. */
	fileLimit: number;
	/** Parcela lastreada por investimento, lida do arquivo. */
	fileGuaranteedLimit: number | null;
	registeredLimit: number;
	registeredGuaranteedLimit: number | null;
	confirmed: boolean;
	onConfirmedChange: (confirmed: boolean) => void;
};

function differs(left: number | null, right: number | null): boolean {
	if (left == null && right == null) return false;
	if (left == null || right == null) return true;
	return Math.abs(left - right) > 0.01;
}

/**
 * Limites do cartão declarados na fatura.
 *
 * A fatura é a fonte mais fresca do limite: o banco o revê todo mês, e a
 * parcela lastreada muda conforme aporte e resgate. Fica atrás de confirmação
 * porque o limite pode ter sido ajustado à mão.
 */
export function CardLimitsCard({
	fileLimit,
	fileGuaranteedLimit,
	registeredLimit,
	registeredGuaranteedLimit,
	confirmed,
	onConfirmedChange,
}: CardLimitsCardProps) {
	const limitChanged = differs(fileLimit, registeredLimit);
	const guaranteedChanged = differs(
		fileGuaranteedLimit,
		registeredGuaranteedLimit,
	);
	const hasChanges = limitChanged || guaranteedChanged;

	return (
		<div
			className={cn(
				"space-y-2 rounded-lg border px-3 py-3 sm:px-4",
				hasChanges
					? "border-amber-500/30 bg-amber-500/5"
					: "border-emerald-500/30 bg-emerald-500/5",
			)}
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				{hasChanges ? (
					<RiInformationLine className="size-4 shrink-0 text-amber-600" />
				) : (
					<RiCheckboxCircleLine className="size-4 shrink-0 text-emerald-600" />
				)}
				<p className="font-medium text-sm">Limites do cartão</p>
				<span
					className={cn(
						"rounded-full border px-2 py-0.5 text-xs",
						hasChanges
							? "border-amber-500/40 text-amber-700 dark:text-amber-500"
							: "border-emerald-500/40 text-emerald-700 dark:text-emerald-500",
					)}
				>
					{hasChanges ? "Mudou" : "Confere"}
				</span>
			</div>

			<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
				<li className="flex items-center gap-1.5">
					<span className="text-muted-foreground">Total</span>
					<span className="font-medium tabular-nums">
						{formatCurrency(fileLimit)}
					</span>
					{limitChanged ? (
						<span className="text-amber-700 dark:text-amber-500">
							(era {formatCurrency(registeredLimit)})
						</span>
					) : null}
				</li>
				{fileGuaranteedLimit != null ? (
					<li className="flex items-center gap-1.5">
						<span className="text-muted-foreground">Garantido</span>
						<span className="font-medium tabular-nums">
							{formatCurrency(fileGuaranteedLimit)}
						</span>
						{guaranteedChanged ? (
							<span className="text-amber-700 dark:text-amber-500">
								(
								{registeredGuaranteedLimit == null
									? "não cadastrado"
									: `era ${formatCurrency(registeredGuaranteedLimit)}`}
								)
							</span>
						) : null}
					</li>
				) : null}
			</ul>

			{hasChanges ? (
				<div className="flex items-start gap-2 pt-1">
					<Checkbox
						id="card-limits-update"
						checked={confirmed}
						onCheckedChange={(checked) => onConfirmedChange(checked === true)}
					/>
					<Label
						htmlFor="card-limits-update"
						className="text-xs font-normal leading-snug"
					>
						Atualizar os limites do cartão com o que a fatura declara
					</Label>
				</div>
			) : null}
		</div>
	);
}
