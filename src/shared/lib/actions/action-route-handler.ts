import { NextResponse } from "next/server";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getOptionalUserSession } from "@/shared/lib/auth/server";
import type { ActionResult } from "@/shared/lib/types/actions";

const UNAUTHORIZED_RESPONSE = NextResponse.json(
	{ success: false, error: "Não autenticado." },
	{ status: 401 },
);

export async function requireAuthSession() {
	const session = await getOptionalUserSession();
	if (!session) {
		return { session: null, unauthorized: UNAUTHORIZED_RESPONSE } as const;
	}

	return { session, unauthorized: null } as const;
}

export async function runActionJson<T>(
	handler: () => Promise<ActionResult<T>>,
) {
	try {
		const result = await handler();
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
