"use client";

import { isImportBatchImported } from "@/features/transactions/lib/import-batch-status";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
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
	onConfirmContinue: () => void;
	onConfirmNewImport?: () => void;
};

export function ImportDuplicateFileDialog({
	open,
	onOpenChange,
	fileName,
	previousImport,
	onConfirmContinue,
	onConfirmNewImport,
}: ImportDuplicateFileDialogProps) {
	const isImported = isImportBatchImported(previousImport.status);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isImported ? "Arquivo já importado" : "Arquivo já enviado"}
					</DialogTitle>
					<DialogDescription>
						O arquivo{" "}
						<span className="font-medium text-foreground">{fileName}</span>{" "}
						{isImported ? (
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
						{isImported
							? ". Deseja continuar mesmo assim?"
							: ". Você pode retomar o rascunho anterior ou iniciar uma importação nova."}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2 sm:flex-col">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					{!isImported && onConfirmNewImport ? (
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								onConfirmNewImport();
								onOpenChange(false);
							}}
						>
							Nova importação
						</Button>
					) : null}
					<Button
						type="button"
						onClick={() => {
							onConfirmContinue();
							onOpenChange(false);
						}}
					>
						{isImported ? "Continuar mesmo assim" : "Retomar rascunho"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
