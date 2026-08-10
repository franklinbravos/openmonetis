import { and, eq } from "drizzle-orm";
import { invoices } from "@/db/schema";
import type { db } from "@/shared/lib/db";

type DbClient = Pick<typeof db, "query" | "insert" | "update">;

export async function upsertInvoicePaymentStatus(
	tx: DbClient,
	input: {
		userId: string;
		cardId: string;
		period: string;
		paymentStatus: string;
	},
): Promise<void> {
	const existing = await tx.query.invoices.findFirst({
		columns: { id: true },
		where: and(
			eq(invoices.userId, input.userId),
			eq(invoices.cardId, input.cardId),
			eq(invoices.period, input.period),
		),
	});

	if (existing) {
		await tx
			.update(invoices)
			.set({ paymentStatus: input.paymentStatus })
			.where(
				and(
					eq(invoices.userId, input.userId),
					eq(invoices.id, existing.id),
				),
			);
		return;
	}

	await tx.insert(invoices).values({
		userId: input.userId,
		cardId: input.cardId,
		period: input.period,
		paymentStatus: input.paymentStatus,
	});
}
