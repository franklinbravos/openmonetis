import { PAYER_ROLE_ADMIN } from "@/shared/lib/payers/constants";
import { callRpc, toRpcNumber } from "@/shared/lib/supabase/rpc";
import { calculatePercentageChange } from "@/shared/utils/math";
import { getPreviousPeriod } from "@/shared/utils/period";

export type DashboardPagador = {
	id: string;
	name: string;
	email: string | null;
	avatarUrl: string | null;
	totalExpenses: number;
	previousExpenses: number;
	percentageChange: number | null;
	isAdmin: boolean;
};

type DashboardPayersSnapshot = {
	payers: DashboardPagador[];
	totalExpenses: number;
};

type DashboardPayerRow = {
	id: string;
	name: string;
	email: string | null;
	avatar_url: string | null;
	role: string | null;
	period: string;
	total_expenses: string | number | null;
};

export async function fetchDashboardPayers(
	userId: string,
	period: string,
): Promise<DashboardPayersSnapshot> {
	const previousPeriod = getPreviousPeriod(period);

	const rows = await callRpc<DashboardPayerRow>("get_dashboard_payers", {
		p_user_id: userId,
		p_periods: [period, previousPeriod],
	});

	const groupedPagadores = new Map<
		string,
		{
			id: string;
			name: string;
			email: string | null;
			avatarUrl: string | null;
			isAdmin: boolean;
			currentExpenses: number;
			previousExpenses: number;
		}
	>();

	for (const row of rows) {
		const entry = groupedPagadores.get(row.id) ?? {
			id: row.id,
			name: row.name,
			email: row.email,
			avatarUrl: row.avatar_url,
			isAdmin: row.role === PAYER_ROLE_ADMIN,
			currentExpenses: 0,
			previousExpenses: 0,
		};

		const amount = toRpcNumber(row.total_expenses);
		if (row.period === period) {
			entry.currentExpenses = amount;
		} else {
			entry.previousExpenses = amount;
		}

		groupedPagadores.set(row.id, entry);
	}

	const payerList = Array.from(groupedPagadores.values())
		.filter((p) => p.currentExpenses > 0)
		.map((pagador) => ({
			id: pagador.id,
			name: pagador.name,
			email: pagador.email,
			avatarUrl: pagador.avatarUrl,
			totalExpenses: pagador.currentExpenses,
			previousExpenses: pagador.previousExpenses,
			percentageChange: calculatePercentageChange(
				pagador.currentExpenses,
				pagador.previousExpenses,
			),
			isAdmin: pagador.isAdmin,
		}))
		.sort((a, b) => b.totalExpenses - a.totalExpenses);

	const totalExpenses = payerList.reduce((sum, p) => sum + p.totalExpenses, 0);

	return {
		payers: payerList,
		totalExpenses,
	};
}
