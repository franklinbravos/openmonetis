"use client";

import { RiCheckLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import type { ImportDuplicateValidation } from "@/features/transactions/lib/import-duplicate-match";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

export type ImportLinkMergeMode = "import" | "existing";

type ImportLinkDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	importedDescription: string;
	importedDate: string;
	importedAmount: number;
	importedCategoryLabel?: string;
	existingCategoryLabel?: string;
	showCategory?: boolean;
	validation: ImportDuplicateValidation | null;
	isPending: boolean;
	onConfirm: (mergeDescription: ImportLinkMergeMode) => void;
};

function ImportLinkChoiceCard({
	selected,
	title,
	dateLabel,
	amountLabel,
	categoryLabel,
	showCategory = true,
	description,
	onSelect,
}: {
	selected: boolean;
	title: string;
	dateLabel: string;
	amountLabel: string;
	categoryLabel?: string;
	showCategory?: boolean;
	description: string;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"rounded-md border p-3 text-left text-sm transition-colors",
				"hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected
					? "border-primary bg-primary/5 ring-2 ring-primary/20"
					: "border-border bg-muted/20",
			)}
		>
			<div className="mb-2 flex items-start justify-between gap-2">
				<p className="font-medium text-foreground leading-none">{title}</p>
				{selected ? (
					<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
						<RiCheckLine className="size-3.5" aria-hidden />
					</span>
				) : (
					<span
						className="size-5 shrink-0 rounded-full border border-muted-foreground/40"
						aria-hidden
					/>
				)}
			</div>
			<p className="text-muted-foreground text-xs">{dateLabel}</p>
			<p className="mt-1 font-medium">{amountLabel}</p>
			{showCategory ? (
				<p className="mt-1 text-muted-foreground text-xs">
					Categoria:{" "}
					<span className="font-medium text-foreground">
						{categoryLabel ?? "Sem categoria"}
					</span>
				</p>
			) : null}
			<p className="mt-2 break-words font-medium text-foreground whitespace-normal">
				{description}
			</p>
			{selected ? (
				<p className="mt-2 text-primary text-xs">Descrição escolhida</p>
			) : (
				<p className="mt-2 text-muted-foreground text-xs">
					Clique para escolher
				</p>
			)}
		</button>
	);
}

export function ImportLinkDialog({
	open,
	onOpenChange,
	importedDescription,
	importedDate,
	importedAmount,
	importedCategoryLabel,
	existingCategoryLabel,
	showCategory = true,
	validation,
	isPending,
	onConfirm,
}: ImportLinkDialogProps) {
	const [mergeDescription, setMergeDescription] =
		useState<ImportLinkMergeMode>("import");

	useEffect(() => {
		if (open) {
			setMergeDescription("import");
		}
	}, [open]);

	const existingDescription =
		validation?.mismatches.find((item) => item.field === "description")
			?.existing ?? "—";

	const existingDateLabel = validation?.mismatches.find(
		(item) => item.field === "date",
	)?.existing;
	const existingAmountLabel = validation?.mismatches.find(
		(item) => item.field === "amount",
	)?.existing;
	const isTransferLink = validation?.existingIsTransfer === true;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isTransferLink ? "Vincular transferência" : "Vincular lançamento"}
					</DialogTitle>
					<DialogDescription>
						{isTransferLink
							? "Data e valor batem com uma transferência já cadastrada entre contas. Escolha qual descrição manter — a outra vai para a observação. Nenhuma despesa ou receita nova será criada."
							: "Data e valor batem com um lançamento já cadastrado, mas a descrição é diferente. Escolha qual card manter — a outra descrição será salva na observação."}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3 sm:grid-cols-2">
					<ImportLinkChoiceCard
						selected={mergeDescription === "import"}
						title="No extrato"
						dateLabel={formatDateOnly(importedDate) ?? importedDate}
						amountLabel={formatCurrency(importedAmount)}
						categoryLabel={importedCategoryLabel}
						showCategory={showCategory}
						description={importedDescription}
						onSelect={() => setMergeDescription("import")}
					/>
					<ImportLinkChoiceCard
						selected={mergeDescription === "existing"}
						title="Já cadastrado"
						dateLabel={
							existingDateLabel ?? formatDateOnly(importedDate) ?? importedDate
						}
						amountLabel={existingAmountLabel ?? formatCurrency(importedAmount)}
						categoryLabel={existingCategoryLabel}
						showCategory={showCategory}
						description={existingDescription}
						onSelect={() => setMergeDescription("existing")}
					/>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => onConfirm(mergeDescription)}
						disabled={isPending}
					>
						{isPending ? "Vinculando…" : "Confirmar vínculo"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
