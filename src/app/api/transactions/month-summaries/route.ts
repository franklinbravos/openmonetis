import {
	fetchTransactionsCashFlowMonthSummaries,
	fetchTransactionsMonthSummaries,
} from "@/features/transactions/queries";
import {
	parseTransactionsViewMode,
	TRANSACTIONS_VIEW_MODE_PARAM,
} from "@/features/transactions/lib/view-mode";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function GET(request: Request) {
	const { session, unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const viewMode = parseTransactionsViewMode(
		new URL(request.url).searchParams.get(TRANSACTIONS_VIEW_MODE_PARAM),
	);

	return runActionJson(async () => {
		const months =
			viewMode === "fluxo-caixa"
				? await fetchTransactionsCashFlowMonthSummaries(session.user.id)
				: await fetchTransactionsMonthSummaries(session.user.id);

		return {
			success: true,
			message: "Resumo mensal carregado.",
			data: { months },
		};
	});
}
