import { adjustAccountBalanceAction } from "@/features/accounts/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ accountId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { accountId } = await context.params;
	const input = await request.json();
	return runActionJson(() =>
		adjustAccountBalanceAction({ accountId, ...input }),
	);
}
