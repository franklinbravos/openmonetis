import { NextResponse } from "next/server";
import { fetchReconciliationSessionAction } from "@/features/reconciliation/actions/fetch-session";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { sessionId } = await context.params;
	const result = await fetchReconciliationSessionAction(sessionId);

	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
