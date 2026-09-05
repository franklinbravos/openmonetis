import type { CreateReconciliationSessionInput } from "@/features/reconciliation/actions/create-session";
import type { ReconciliationLine } from "@/db/schema";
import {
	fetchActionResult,
	fetchJsonData,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

type ReconciliationSessionData = {
	id: string;
	sourceFileName: string;
	statementTotal: string;
	lines: ReconciliationLine[];
};

export async function createReconciliationSessionClient(
	input: CreateReconciliationSessionInput,
): Promise<ActionResult<{ sessionId: string; lineCount: number }>> {
	return fetchActionResult<{ sessionId: string; lineCount: number }>(
		"/api/reconciliation/sessions",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
		"Não foi possível criar a sessão de conciliação.",
	);
}

export async function fetchReconciliationSessionClient(
	sessionId: string,
): Promise<ActionResult<ReconciliationSessionData>> {
	return fetchJsonData<ActionResult<ReconciliationSessionData>>(
		`/api/reconciliation/sessions/${sessionId}`,
		undefined,
		"Não foi possível carregar a sessão de conciliação.",
	);
}
