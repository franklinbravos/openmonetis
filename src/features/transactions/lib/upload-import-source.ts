import { uploadImportSourceFileClient } from "@/features/transactions/lib/import-api-client";

type UploadImportSourceFileInput = {
	file: File;
	importBatchId: string;
	sourceFileName?: string;
	importedCount: number;
	skippedCount: number;
	cardId?: string | null;
	invoicePeriod?: string | null;
	accountId?: string | null;
};

export async function uploadImportSourceFile({
	file,
	importBatchId,
	sourceFileName = file.name,
	importedCount,
	skippedCount,
	cardId = null,
	invoicePeriod = null,
	accountId = null,
}: UploadImportSourceFileInput): Promise<{ success: boolean; error?: string }> {
	try {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("importBatchId", importBatchId);
		formData.append("sourceFileName", sourceFileName);
		formData.append("importedCount", String(importedCount));
		formData.append("skippedCount", String(skippedCount));

		if (cardId) formData.append("cardId", cardId);
		if (invoicePeriod) formData.append("invoicePeriod", invoicePeriod);
		if (accountId) formData.append("accountId", accountId);

		return await uploadImportSourceFileClient(formData);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Erro ao enviar o arquivo original.";
		return { success: false, error: message };
	}
}
