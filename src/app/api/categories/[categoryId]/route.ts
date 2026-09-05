import {
	deleteCategoryAction,
	fetchCategoryLinkedTransactionsAction,
	updateCategoryAction,
} from "@/features/categories/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ categoryId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { categoryId } = await context.params;
	return runActionJson(() => fetchCategoryLinkedTransactionsAction(categoryId));
}

export async function PATCH(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { categoryId } = await context.params;
	const input = await request.json();
	return runActionJson(() => updateCategoryAction({ id: categoryId, ...input }));
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { categoryId } = await context.params;
	return runActionJson(() => deleteCategoryAction({ id: categoryId }));
}
