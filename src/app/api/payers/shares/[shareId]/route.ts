import {
	deletePayerShareAction,
} from "@/features/payers/actions";
import { updatePayerSharePermissionAction } from "@/features/payers/actions/share-access";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ shareId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { shareId } = await context.params;
	return runActionJson(() => deletePayerShareAction({ shareId }));
}

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { shareId } = await context.params;
	const input = await request.json();
	return runActionJson(() =>
		updatePayerSharePermissionAction({ shareId, ...input }),
	);
}
