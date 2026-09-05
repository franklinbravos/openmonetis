import {
	deletePayerAction,
	updatePayerAction,
} from "@/features/payers/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ payerId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { payerId } = await context.params;
	const input = await request.json();
	return runActionJson(() => updatePayerAction({ id: payerId, ...input }));
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { payerId } = await context.params;
	return runActionJson(() => deletePayerAction({ id: payerId }));
}
