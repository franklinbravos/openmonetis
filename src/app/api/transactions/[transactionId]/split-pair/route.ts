import { updateTransactionSplitPairAction } from "@/features/transactions/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ transactionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { transactionId } = await context.params;
	const input = await request.json();

	return runActionJson(() =>
		updateTransactionSplitPairAction({ ...input, id: transactionId }),
	);
}
