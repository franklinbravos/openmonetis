import { getCategoryBudgetSummaryAction } from "@/features/budgets/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function GET(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { searchParams } = new URL(request.url);
	const categoryId = searchParams.get("categoryId");
	const period = searchParams.get("period");

	if (!categoryId || !period) {
		return runActionJson(async () => ({
			success: false,
			error: "Parâmetros inválidos.",
		}));
	}

	return runActionJson(() =>
		getCategoryBudgetSummaryAction({ categoryId, period }),
	);
}
