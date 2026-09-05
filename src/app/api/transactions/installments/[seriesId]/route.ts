import { NextResponse } from "next/server";
import { fetchInstallmentSeriesAction } from "@/features/transactions/actions/installment-series";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

const PRIVATE_RESPONSE_HEADERS = {
	"Cache-Control": "private, no-store",
};

type RouteContext = {
	params: Promise<{ seriesId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { seriesId } = await context.params;
	const rows = await fetchInstallmentSeriesAction(seriesId);

	return NextResponse.json(rows, { headers: PRIVATE_RESPONSE_HEADERS });
}
