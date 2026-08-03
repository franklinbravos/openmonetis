import { and, desc, eq } from "drizzle-orm";
import { reconciliationLines, reconciliationSessions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import type { ReconciliationSessionWithLines } from "./lib/types";

export async function fetchReconciliationSession(
	userId: string,
	sessionId: string,
): Promise<ReconciliationSessionWithLines | null> {
	const session = await db.query.reconciliationSessions.findFirst({
		where: and(
			eq(reconciliationSessions.id, sessionId),
			eq(reconciliationSessions.userId, userId),
		),
	});

	if (!session) {
		return null;
	}

	const lines = await db.query.reconciliationLines.findMany({
		where: and(
			eq(reconciliationLines.sessionId, sessionId),
			eq(reconciliationLines.userId, userId),
		),
		orderBy: [reconciliationLines.lineIndex],
	});

	return { ...session, lines };
}

export async function fetchRecentReconciliationSessions(
	userId: string,
	limit = 5,
) {
	return db.query.reconciliationSessions.findMany({
		where: eq(reconciliationSessions.userId, userId),
		orderBy: [desc(reconciliationSessions.createdAt)],
		limit,
	});
}
