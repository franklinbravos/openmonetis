import { and, desc, eq, isNotNull } from "drizzle-orm";
import { importBatches } from "@/db/schema";
import { db } from "@/shared/lib/db";

export async function fetchInvoiceImportSource(
	userId: string,
	cardId: string,
	invoicePeriod: string,
): Promise<{ fileName: string; invoicePeriod: string } | null> {
	const batch = await db.query.importBatches.findFirst({
		columns: {
			sourceFileName: true,
			invoicePeriod: true,
		},
		where: and(
			eq(importBatches.userId, userId),
			eq(importBatches.cardId, cardId),
			eq(importBatches.invoicePeriod, invoicePeriod),
			isNotNull(importBatches.attachmentId),
		),
		orderBy: [desc(importBatches.createdAt)],
	});

	if (!batch?.invoicePeriod) return null;

	return {
		fileName: batch.sourceFileName,
		invoicePeriod: batch.invoicePeriod,
	};
}
