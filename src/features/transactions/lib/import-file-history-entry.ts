import { isImportBatchDraft } from "@/features/transactions/lib/import-batch-status";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { displayPeriod } from "@/shared/utils/period";

export function formatImportEntryContext(
	entry: Pick<
		ImportFileHistoryEntry,
		"cardName" | "invoicePeriod" | "accountName"
	>,
): string | null {
	if (entry.cardName && entry.invoicePeriod) {
		return `${entry.cardName} · ${displayPeriod(entry.invoicePeriod)}`;
	}

	return entry.accountName;
}

export function resolveImportEntryActionLabel(
	entry: Pick<ImportFileHistoryEntry, "status" | "hasAttachment">,
): string {
	if (isImportBatchDraft(entry.status)) {
		return "Continuar";
	}

	return entry.hasAttachment ? "Reprocessar" : "Reenviar arquivo";
}
