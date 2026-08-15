"use client";

import { RiSliceFill } from "@remixicon/react";
import { useState } from "react";
import {
	applyPayerSelection,
	getSelectedPayerIds,
} from "@/features/transactions/lib/form-helpers";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { getAvatarSrc } from "@/shared/lib/payers/utils";
import { cn } from "@/shared/utils/ui";
import { PayerTagsSelect } from "./payer-tags-select";
import { getSplitSummaryData, SplitConfigDialog } from "./split-config-dialog";
import type { PayerSectionProps } from "./transaction-dialog-types";

type SplitSummary = ReturnType<typeof getSplitSummaryData>;

function SplitSummaryContent({ summary }: { summary: SplitSummary }) {
	if (summary.type === "text") {
		return <p className="text-xs text-muted-foreground">{summary.label}</p>;
	}

	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
			<span>{summary.count} pessoas:</span>
			{summary.participants.map((participant, index) => {
				const initial = participant.label.charAt(0).toUpperCase() || "?";

				return (
					<span
						key={`${participant.label}-${index}`}
						className="inline-flex min-w-0 items-center gap-0.5"
					>
						<Avatar className="size-4 border border-border/60 bg-background">
							<AvatarImage
								src={getAvatarSrc(participant.avatarUrl)}
								alt={`Avatar de ${participant.label}`}
							/>
							<AvatarFallback className="text-[0.55rem] font-medium uppercase">
								{initial}
							</AvatarFallback>
						</Avatar>
						<span>{participant.firstName}</span>
					</span>
				);
			})}
			{summary.remainingCount > 0 ? (
				<span>+{summary.remainingCount}</span>
			) : null}
			<span aria-hidden>·</span>
			<span>{summary.totalLabel}</span>
		</div>
	);
}

export function PayerSection({
	formState,
	onFieldChange,
	payerOptions,
	splitPayerOptions,
	totalAmount,
}: PayerSectionProps) {
	const [splitConfigOpen, setSplitConfigOpen] = useState(false);
	const selectedPayerIds = getSelectedPayerIds(formState);
	const hasMultiplePayers = selectedPayerIds.length > 1;
	const splitSummary = getSplitSummaryData(
		formState,
		payerOptions,
		totalAmount,
	);

	const applySelection = (selectedIds: string[]) => {
		const updates = applyPayerSelection(selectedIds, formState);
		for (const [key, value] of Object.entries(updates)) {
			onFieldChange(key as keyof typeof formState, value as never);
		}
	};

	const handleSplitToggle = (checked: boolean) => {
		if (!checked && hasMultiplePayers && formState.payerId) {
			applySelection([formState.payerId]);
			return;
		}

		onFieldChange("isSplit", checked);

		if (checked) {
			setSplitConfigOpen(true);
		}
	};

	return (
		<div className="space-y-2">
			<Label htmlFor="payer">Pessoa</Label>

			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<PayerTagsSelect
						id="payer"
						options={payerOptions}
						selectedIds={selectedPayerIds}
						onChange={applySelection}
						placeholder="Adicionar pessoa"
					/>
				</div>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-pressed={formState.isSplit}
							aria-label="Dividir lançamento"
							className={cn(
								"size-9 shrink-0",
								formState.isSplit &&
									"border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
							)}
							onClick={() => handleSplitToggle(!formState.isSplit)}
						>
							<RiSliceFill className="size-4" aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">
						Dividir lançamento entre pessoas
					</TooltipContent>
				</Tooltip>
			</div>

			{formState.isSplit ? (
				<button
					type="button"
					className="w-full rounded-md border border-primary/15 bg-primary/5 px-2.5 py-2 text-left transition-colors hover:bg-primary/8"
					onClick={() => setSplitConfigOpen(true)}
				>
					<SplitSummaryContent summary={splitSummary} />
				</button>
			) : null}

			<SplitConfigDialog
				open={splitConfigOpen}
				onOpenChange={setSplitConfigOpen}
				formState={formState}
				onFieldChange={onFieldChange}
				payerOptions={payerOptions}
				splitPayerOptions={splitPayerOptions}
				totalAmount={totalAmount}
			/>
		</div>
	);
}
