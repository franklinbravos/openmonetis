import { refundTransactionAction } from "@/features/transactions/actions/refund-action";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ transactionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { transactionId } = await context.params;
	const input = await request.json();

	return runActionJson(() =>
		refundTransactionAction({
			...input,
			originalTransactionId: transactionId,
		}),
	);
}
