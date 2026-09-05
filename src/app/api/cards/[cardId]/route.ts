import { NextResponse } from "next/server";
import { updateCardAction, deleteCardAction } from "@/features/cards/actions";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getOptionalUserSession } from "@/shared/lib/auth/server";

type RouteContext = {
	params: Promise<{ cardId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const session = await getOptionalUserSession();
	if (!session) {
		return NextResponse.json(
			{ success: false, error: "Não autenticado." },
			{ status: 401 },
		);
	}

	try {
		const { cardId } = await context.params;
		const input = await request.json();
		const result = await updateCardAction({ id: cardId, ...input });
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

export async function DELETE(_request: Request, context: RouteContext) {
	const session = await getOptionalUserSession();
	if (!session) {
		return NextResponse.json(
			{ success: false, error: "Não autenticado." },
			{ status: 401 },
		);
	}

	try {
		const { cardId } = await context.params;
		const result = await deleteCardAction({ id: cardId });
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
