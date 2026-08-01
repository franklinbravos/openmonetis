"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
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

	const handleSplitCardClick = () => {
		if (formState.isSplit) {
			setSplitConfigOpen(true);
			return;
		}

		handleSplitToggle(true);
	};

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<Label htmlFor="payer">Pessoa</Label>
				<PayerTagsSelect
					id="payer"
					options={payerOptions}
					selectedIds={selectedPayerIds}
					onChange={applySelection}
					placeholder="Adicionar pessoa"
				/>
			</div>

			<div
				className={cn(
					"rounded-lg border px-3 py-2.5 transition-colors",
					formState.isSplit
						? "border-primary/20 bg-primary/5"
						: "border-border bg-transparent",
				)}
			>
				<div className="flex items-start justify-between gap-3">
					<button
						type="button"
						className="min-w-0 flex-1 space-y-0.5 text-left"
						onClick={handleSplitCardClick}
					>
						<p className="text-sm text-foreground">Dividir lançamento</p>
						<SplitSummaryContent summary={splitSummary} />
					</button>
					<CheckboxPrimitive.Root
						checked={formState.isSplit}
						onCheckedChange={(checked) => handleSplitToggle(Boolean(checked))}
						aria-label="Dividir lançamento"
						className={cn(
							"peer mt-0.5 size-4 shrink-0 rounded-lg border shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
							formState.isSplit
								? "border-primary bg-primary text-primary-foreground"
								: "border-input dark:bg-input/30",
						)}
					>
						<CheckboxPrimitive.Indicator className="grid place-content-center text-current transition-none">
							<RiSliceFill className="size-3" />
						</CheckboxPrimitive.Indicator>
					</CheckboxPrimitive.Root>
				</div>

				{formState.isSplit ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="mt-3 w-full"
						onClick={() => setSplitConfigOpen(true)}
					>
						Editar divisão
					</Button>
				) : null}
			</div>

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
