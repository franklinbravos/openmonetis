import { NextResponse } from "next/server";
import { deleteSavedInsightsAction } from "@/features/insights/actions/storage";
import {
	fetchSavedInsights,
	savedInsightsPeriodSchema,
} from "@/features/insights/queries";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";
import { getOptionalUserSession } from "@/shared/lib/auth/server";

const PRIVATE_RESPONSE_HEADERS = {
	"Cache-Control": "private, no-store",
};

export async function GET(request: Request) {
	const period = new URL(request.url).searchParams.get("period") ?? "";
	const validatedPeriod = savedInsightsPeriodSchema.safeParse(period);

	if (!validatedPeriod.success) {
		return NextResponse.json(
			{
				error: validatedPeriod.error.issues[0]?.message ?? "Período inválido.",
			},
			{
				status: 400,
				headers: PRIVATE_RESPONSE_HEADERS,
			},
		);
	}

	const session = await getOptionalUserSession();
	if (!session?.user) {
		return NextResponse.json(
			{ error: "Não autenticado" },
			{ status: 401, headers: PRIVATE_RESPONSE_HEADERS },
		);
	}

	const insights = await fetchSavedInsights(
		session.user.id,
		validatedPeriod.data,
	);

	return NextResponse.json(insights, {
		headers: PRIVATE_RESPONSE_HEADERS,
	});
}

export async function DELETE(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const period = new URL(request.url).searchParams.get("period") ?? "";
		const result = await deleteSavedInsightsAction(period);

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
