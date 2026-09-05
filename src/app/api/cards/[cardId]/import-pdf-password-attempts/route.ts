import { NextResponse } from "next/server";
import { fetchCardImportPdfPasswordAttemptsAction } from "@/features/cards/actions/fetch-import-pdf-password-attempts-action";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ cardId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { cardId } = await context.params;
	const result = await fetchCardImportPdfPasswordAttemptsAction({ cardId });

	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
