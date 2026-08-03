import { and, eq, gt, isNull } from "drizzle-orm";
import { payerShareInvites } from "@/db/schema";
import { db } from "@/shared/lib/db";

export async function hasPendingInviteForEmail(
	email: string,
): Promise<boolean> {
	const normalizedEmail = email.toLowerCase();
	const invite = await db.query.payerShareInvites.findFirst({
		columns: { id: true },
		where: and(
			eq(payerShareInvites.email, normalizedEmail),
			isNull(payerShareInvites.acceptedAt),
			gt(payerShareInvites.expiresAt, new Date()),
		),
	});

	return Boolean(invite);
}
