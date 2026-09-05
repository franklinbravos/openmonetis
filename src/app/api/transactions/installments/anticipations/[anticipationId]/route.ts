import { cancelInstallmentAnticipationAction } from "@/features/transactions/actions/anticipation";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ anticipationId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { anticipationId } = await context.params;

	return runActionJson(() =>
		cancelInstallmentAnticipationAction({ anticipationId }),
	);
}
