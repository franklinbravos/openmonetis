import { NextResponse } from "next/server";
import { generateInsightsAction } from "@/features/insights/actions/generate";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const body = (await request.json()) as {
			period?: string;
			modelId?: string;
			userInstructions?: string;
			credentialOverride?: unknown;
		};

		const result = await generateInsightsAction(
			body.period ?? "",
			body.modelId ?? "",
			body.userInstructions,
			body.credentialOverride as Parameters<
				typeof generateInsightsAction
			>[3],
		);

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
