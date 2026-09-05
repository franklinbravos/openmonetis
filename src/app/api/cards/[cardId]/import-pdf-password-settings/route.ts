import { NextResponse } from "next/server";
import { updateCardImportPdfPasswordSettingsAction } from "@/features/cards/actions/import-pdf-password-action";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ cardId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const { cardId } = await context.params;
		const input = await request.json();
		const result = await updateCardImportPdfPasswordSettingsAction({
			...input,
			cardId,
		});

		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	} catch (error) {
		const result = handleActionError(error);
		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	}
}
