import { and, desc, eq } from "drizzle-orm";
import { reconciliationLines, reconciliationSessions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import type { ReconciliationSessionWithLines } from "./lib/types";

export async function fetchReconciliationSession(
	userId: string,
	sessionId: string,
): Promise<ReconciliationSessionWithLines | null> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	const session = await db.query.reconciliationSessions.findFirst({
		where: and(
			eq(reconciliationSessions.id, sessionId),
			eq(reconciliationSessions.userId, dataOwnerUserId),
		),
	});

	if (!session) {
		return null;
	}

	const lines = await db.query.reconciliationLines.findMany({
		where: and(
			eq(reconciliationLines.sessionId, sessionId),
			eq(reconciliationLines.userId, dataOwnerUserId),
		),
		orderBy: [reconciliationLines.lineIndex],
	});

	return { ...session, lines };
}

export async function fetchRecentReconciliationSessions(
	userId: string,
	limit = 5,
) {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	return db.query.reconciliationSessions.findMany({
		where: eq(reconciliationSessions.userId, dataOwnerUserId),
		orderBy: [desc(reconciliationSessions.createdAt)],
		limit,
	});
}
