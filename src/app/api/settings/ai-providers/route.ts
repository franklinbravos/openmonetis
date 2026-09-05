import { NextResponse } from "next/server";
import { updateAiProviderSettingsAction } from "@/features/settings/actions/ai-providers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function PATCH(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const input = await request.json();
	const result = await updateAiProviderSettingsAction(input);
	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
