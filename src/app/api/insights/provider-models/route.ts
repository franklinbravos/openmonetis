import { NextResponse } from "next/server";
import { fetchProviderModelsAction } from "@/features/insights/actions/fetch-provider-models";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const input = await request.json();
		const result = await fetchProviderModelsAction(input);

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
