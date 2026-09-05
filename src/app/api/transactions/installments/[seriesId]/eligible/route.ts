import { getEligibleInstallmentsAction } from "@/features/transactions/actions/anticipation";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ seriesId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { seriesId } = await context.params;
	const { searchParams } = new URL(request.url);
	const anticipationPeriod = searchParams.get("anticipationPeriod");

	if (!anticipationPeriod) {
		return runActionJson(async () => ({
			success: false,
			error: "Período de antecipação é obrigatório.",
		}));
	}

	return runActionJson(() =>
		getEligibleInstallmentsAction(seriesId, anticipationPeriod),
	);
}
