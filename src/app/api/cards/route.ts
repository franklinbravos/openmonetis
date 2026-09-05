import { NextResponse } from "next/server";
import { createCardAction } from "@/features/cards/actions";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getOptionalUserSession } from "@/shared/lib/auth/server";

export async function POST(request: Request) {
	const session = await getOptionalUserSession();
	if (!session) {
		return NextResponse.json(
			{ success: false, error: "Não autenticado." },
			{ status: 401 },
		);
	}

	try {
		const input = await request.json();
		const result = await createCardAction(input);
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
