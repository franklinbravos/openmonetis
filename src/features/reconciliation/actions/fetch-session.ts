"use server";

import { fetchReconciliationSession } from "@/features/reconciliation/queries";
import { getUserId } from "@/shared/lib/auth/server";
import type { ActionResult } from "@/shared/lib/types/actions";

export async function fetchReconciliationSessionAction(
	sessionId: string,
): Promise<
	ActionResult<
		NonNullable<Awaited<ReturnType<typeof fetchReconciliationSession>>>
	>
> {
	const userId = await getUserId();
	const session = await fetchReconciliationSession(userId, sessionId);

	if (!session) {
		return { success: false, error: "Sessão não encontrada." };
	}

	return { success: true, message: "Sessão carregada.", data: session };
}
