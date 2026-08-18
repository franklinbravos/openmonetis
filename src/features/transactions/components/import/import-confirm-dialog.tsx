"use client";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

type ImportConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	importCount: number;
	verifiedCount: number;
	replacedCount: number;
	excludedCount: number;
	removalCount?: number;
	installmentBackfillCount: number;
	amountCorrectionCount?: number;
	isPaidInvoiceImport?: boolean;
	isPending: boolean;
	invoiceTotalDelta?: number | null;
	invoiceTotalOverrideConfirmed?: boolean;
	onInvoiceTotalOverrideChange?: (confirmed: boolean) => void;
	canConfirm?: boolean;
	onConfirm: () => void;
};

export function ImportConfirmDialog({
	open,
	onOpenChange,
	importCount,
	verifiedCount,
	replacedCount,
	excludedCount,
	removalCount = 0,
	installmentBackfillCount,
	amountCorrectionCount = 0,
	isPaidInvoiceImport = false,
	isPending,
	invoiceTotalDelta = null,
	invoiceTotalOverrideConfirmed = false,
	onInvoiceTotalOverrideChange,
	canConfirm = true,
	onConfirm,
}: ImportConfirmDialogProps) {
	const editedCount = replacedCount + installmentBackfillCount;
	const hasInvoiceTotalMismatch =
		invoiceTotalDelta != null && Math.abs(invoiceTotalDelta) > 0.01;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isPaidInvoiceImport
							? "Confirmar pagamento da fatura"
							: "Confirmar importação"}
					</DialogTitle>
					<DialogDescription>
						{isPaidInvoiceImport
							? importCount > 0
								? "Os lançamentos serão importados e a fatura será marcada como paga."
								: "Os lançamentos já estão importados. A fatura será marcada como paga."
							: "Revise o resumo abaixo antes de concluir a importação."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 rounded-md border bg-muted/20 p-4 text-sm">
					{importCount > 0 ? (
						<SummaryRow
							label="Serão importados"
							value={importCount}
							tone="success"
							prefix="+"
							emphasis
						/>
					) : isPaidInvoiceImport ? (
						<p className="text-muted-foreground text-sm leading-relaxed">
							Nenhum lançamento novo será importado.
						</p>
					) : null}
					{verifiedCount > 0 ? (
						<SummaryRow label="Conferidos" value={verifiedCount} tone="info" />
					) : null}
					{editedCount > 0 ? (
						<SummaryRow label="Serão editados" value={editedCount} />
					) : null}
					{amountCorrectionCount > 0 ? (
						<SummaryRow
							label="Valores corrigidos"
							value={amountCorrectionCount}
							tone="info"
						/>
					) : null}
					{excludedCount > 0 ? (
						<SummaryRow
							label="Excluídos do arquivo"
							value={excludedCount}
							tone="destructive"
							prefix="-"
						/>
					) : null}
					{removalCount > 0 ? (
						<SummaryRow
							label="Serão removidos do cadastro"
							value={removalCount}
							tone="destructive"
							prefix="-"
						/>
					) : null}
					{installmentBackfillCount > 0 ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							O parcelamento inclui {installmentBackfillCount} lançamento
							{installmentBackfillCount !== 1 ? "s" : ""} em faturas anteriores.
						</p>
					) : null}
					{replacedCount > 0 ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							{replacedCount} lançamento{replacedCount !== 1 ? "s" : ""} já
							importado{replacedCount !== 1 ? "s" : ""} será
							{replacedCount !== 1 ? "ão" : ""} substituído
							{replacedCount !== 1 ? "s" : ""}.
						</p>
					) : null}
				</div>

				{hasInvoiceTotalMismatch && onInvoiceTotalOverrideChange ? (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
						<p className="text-destructive text-sm">
							O total projetado difere em{" "}
							{formatCurrency(Math.abs(invoiceTotalDelta))} do total do arquivo.
						</p>
						<div className="mt-3 flex items-start gap-2">
							<Checkbox
								id="invoice-total-override"
								checked={invoiceTotalOverrideConfirmed}
								onCheckedChange={(checked) =>
									onInvoiceTotalOverrideChange(checked === true)
								}
							/>
							<Label
								htmlFor="invoice-total-override"
								className="text-sm leading-snug font-normal"
							>
								Importar mesmo com diferença de{" "}
								{formatCurrency(Math.abs(invoiceTotalDelta))}
							</Label>
						</div>
					</div>
				) : null}

				<DialogFooter className="gap-2 sm:gap-0">
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
						onClick={onConfirm}
						disabled={isPending || !canConfirm}
					>
						{isPending
							? isPaidInvoiceImport
								? "Processando…"
								: "Importando…"
							: isPaidInvoiceImport
								? "Confirmar pagamento"
								: "Confirmar importação"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const summaryToneClassName = {
	default: "text-foreground",
	success: "text-emerald-600 dark:text-emerald-400",
	info: "text-blue-600 dark:text-blue-400",
	destructive: "text-destructive",
} as const;

function SummaryRow({
	label,
	value,
	emphasis = false,
	tone = "default",
	prefix,
}: {
	label: string;
	value: number;
	emphasis?: boolean;
	tone?: keyof typeof summaryToneClassName;
	prefix?: "+" | "-";
}) {
	const countLabel = `${prefix ?? ""}${value} lançamento${value !== 1 ? "s" : ""}`;

	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span
				className={cn(
					emphasis ? "font-semibold" : "font-medium",
					summaryToneClassName[tone],
				)}
			>
				{countLabel}
			</span>
		</div>
	);
}
