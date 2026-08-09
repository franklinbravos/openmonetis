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
import { displayPeriod } from "@/shared/utils/period";

type ImportInvoicePeriodMismatchDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cardName: string;
	expectedPeriod: string;
	filePeriod: string;
	onConfirm: () => void;
};

export function ImportInvoicePeriodMismatchDialog({
	open,
	onOpenChange,
	cardName,
	expectedPeriod,
	filePeriod,
	onConfirm,
}: ImportInvoicePeriodMismatchDialogProps) {
	const expectedLabel = displayPeriod(expectedPeriod);
	const fileLabel = displayPeriod(filePeriod);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Fatura diferente detectada</DialogTitle>
					<DialogDescription>
						O arquivo enviado é da fatura de{" "}
						<span className="font-medium text-foreground">{fileLabel}</span>,
						mas você veio da fatura de{" "}
						<span className="font-medium text-foreground">{expectedLabel}</span>{" "}
						do cartão {cardName}.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border bg-muted/20 p-4 text-sm leading-relaxed">
					<p>
						Deseja importar para a fatura de{" "}
						<span className="font-medium text-foreground">{fileLabel}</span>?
					</p>
					<p className="mt-2 text-muted-foreground text-xs">
						A fatura de destino será atualizada para corresponder ao arquivo.
					</p>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={onConfirm}>
						Usar fatura de {fileLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
