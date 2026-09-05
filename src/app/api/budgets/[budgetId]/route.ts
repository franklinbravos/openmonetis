import {
	deleteBudgetAction,
	updateBudgetAction,
} from "@/features/budgets/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ budgetId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { budgetId } = await context.params;
	const input = await request.json();
	return runActionJson(() => updateBudgetAction({ id: budgetId, ...input }));
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { budgetId } = await context.params;
	return runActionJson(() => deleteBudgetAction({ id: budgetId }));
}
