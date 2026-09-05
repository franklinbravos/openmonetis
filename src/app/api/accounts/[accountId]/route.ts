import {
	deleteAccountAction,
	updateAccountAction,
} from "@/features/accounts/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ accountId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { accountId } = await context.params;
	const input = await request.json();
	return runActionJson(() => updateAccountAction({ id: accountId, ...input }));
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { accountId } = await context.params;
	return runActionJson(() => deleteAccountAction({ id: accountId }));
}
