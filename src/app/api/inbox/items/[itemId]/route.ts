import {
	deleteInboxItemAction,
	discardInboxItemAction,
	markInboxAsProcessedAction,
	restoreDiscardedInboxItemAction,
} from "@/features/inbox/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ itemId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { itemId } = await context.params;
	return runActionJson(() => deleteInboxItemAction({ inboxItemId: itemId }));
}
