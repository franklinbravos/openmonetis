"use client";

import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";

type ImportConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	importCount: number;
	replacedCount: number;
	excludedCount: number;
	installmentBackfillCount: number;
	isPaidInvoiceImport?: boolean;
	isPending: boolean;
	onConfirm: () => void;
};

export function ImportConfirmDialog({
	open,
	onOpenChange,
	importCount,
	replacedCount,
	excludedCount,
	installmentBackfillCount,
	isPaidInvoiceImport = false,
	isPending,
	onConfirm,
}: ImportConfirmDialogProps) {
	const editedCount = replacedCount + installmentBackfillCount;

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
							? "Os lançamentos serão importados e a fatura será marcada como paga."
							: "Revise o resumo abaixo antes de concluir a importação."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 rounded-md border bg-muted/20 p-4 text-sm">
					<SummaryRow
						label="Serão importados"
						value={importCount}
						emphasis
					/>
					<SummaryRow label="Serão editados" value={editedCount} />
					<SummaryRow label="Serão excluídos" value={excludedCount} />
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

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={onConfirm} disabled={isPending}>
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

function SummaryRow({
	label,
	value,
	emphasis = false,
}: {
	label: string;
	value: number;
	emphasis?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span
				className={
					emphasis ? "font-semibold text-foreground" : "font-medium text-foreground"
				}
			>
				{value} lançamento{value !== 1 ? "s" : ""}
			</span>
		</div>
	);
}
