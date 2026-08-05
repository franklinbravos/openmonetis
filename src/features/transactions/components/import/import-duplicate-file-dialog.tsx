"use client";

import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { isImportBatchImported } from "@/features/transactions/lib/import-batch-status";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { formatDateTime } from "@/shared/utils/date";

type ImportDuplicateFileDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	fileName: string;
	previousImport: ImportFileHistoryEntry;
	onConfirm: () => void;
};

export function ImportDuplicateFileDialog({
	open,
	onOpenChange,
	fileName,
	previousImport,
	onConfirm,
}: ImportDuplicateFileDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isImportBatchImported(previousImport.status)
							? "Arquivo já importado"
							: "Arquivo já enviado"}
					</DialogTitle>
					<DialogDescription>
						O arquivo <span className="font-medium text-foreground">{fileName}</span>{" "}
						{isImportBatchImported(previousImport.status) ? (
							<>
								já foi processado em{" "}
								<span className="font-medium text-foreground">
									{formatDateTime(previousImport.createdAt)}
								</span>
								{previousImport.importedCount > 0
									? ` (${previousImport.importedCount} lançamento${previousImport.importedCount !== 1 ? "s" : ""} importado${previousImport.importedCount !== 1 ? "s" : ""})`
									: ""}
							</>
						) : (
							<>
								já foi enviado em{" "}
								<span className="font-medium text-foreground">
									{formatDateTime(previousImport.createdAt)}
								</span>
								, mas a importação não foi concluída
							</>
						)}
						. Deseja continuar mesmo assim?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2 sm:gap-0">
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => {
							onConfirm();
							onOpenChange(false);
						}}
					>
						Continuar mesmo assim
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
