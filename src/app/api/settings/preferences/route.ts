import { NextResponse } from "next/server";
import { updatePreferencesAction } from "@/features/settings/actions";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function PATCH(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const input = await request.json();
	const result = await updatePreferencesAction(input);
	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
