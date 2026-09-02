import type { DashboardCardMetrics } from "@/features/dashboard/overview/dashboard-metrics-queries";
import type {
	IncomeExpenseBalanceData,
	MonthData,
} from "@/features/dashboard/overview/income-expense-balance-queries";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { safeToNumber } from "@/shared/utils/number";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	buildPeriodWindow,
	comparePeriods,
	formatPeriodMonthShort,
	getCurrentPeriod,
	getPreviousPeriod,
} from "@/shared/utils/period";

const TRANSACTION_TYPE_INCOME = "Receita";
const TRANSACTION_TYPE_EXPENSE = "Despesa";
const TRANSACTION_TYPE_TRANSFER = "Transferência";

export type PeriodTotals = {
	/** Previsão do mês: inclui o que ainda não foi pago. */
	receitas: number;
	despesas: number;
	/** O que de fato movimentou a conta — lançamento marcado como realizado. */
	receitasRealizadas: number;
	despesasRealizadas: number;
	reembolsos: number;
	reembolsosRealizados: number;
	transferAdjustment: number;
	balanco: number;
};

export type PeriodSummaryRow = {
	period: string | null;
	transactionType: string;
	/**
	 * Lançamento efetivado: é o que separa entrada de fato de previsão.
	 *
	 * Opcional porque a visão por data de compra (`get_purchase_date_overview`)
	 * não usa a separação e não traz a coluna.
	 */
	isSettled?: boolean | null;
	totalAmount: string | number | null;
	refundAmount: string | number | null;
	accountExcludeFromBalance: boolean | null;
};

type PeriodOverviewRow = {
	periodo: string | null;
	tipo_transacao: string | null;
	/** Ausente enquanto a migration do RPC não foi aplicada. */
	realizado?: boolean | null;
	total_amount: string | number | null;
	refund_amount: string | number | null;
	conta_excluir_do_saldo: boolean | null;
};

type DashboardPeriodOverview = {
	metrics: DashboardCardMetrics;
	incomeExpenseBalanceData: IncomeExpenseBalanceData;
};

const createEmptyTotals = (): PeriodTotals => ({
	receitas: 0,
	despesas: 0,
	receitasRealizadas: 0,
	despesasRealizadas: 0,
	reembolsos: 0,
	reembolsosRealizados: 0,
	transferAdjustment: 0,
	balanco: 0,
});

const ensurePeriodTotals = (
	store: Map<string, PeriodTotals>,
	period: string,
): PeriodTotals => {
	const existing = store.get(period);
	if (existing) {
		return existing;
	}

	const totals = createEmptyTotals();
	store.set(period, totals);
	return totals;
};

const generateLast6Months = (currentPeriod: string): string[] => {
	try {
		return buildPeriodWindow(currentPeriod, 6);
	} catch {
		return buildPeriodWindow(getCurrentPeriod(), 6);
	}
};

const emptyOverview = (period: string): DashboardPeriodOverview => {
	const previousPeriod = getPreviousPeriod(period);

	return {
		metrics: {
			period,
			previousPeriod,
			receitas: { current: 0, previous: 0 },
			despesas: { current: 0, previous: 0 },
			balanco: { current: 0, previous: 0 },
			previsto: { current: 0, previous: 0 },
		},
		incomeExpenseBalanceData: { months: [] },
	};
};

export const buildPeriodTotals = (
	rows: PeriodSummaryRow[],
): Map<string, PeriodTotals> => {
	const periodTotals = new Map<string, PeriodTotals>();

	for (const row of rows) {
		if (!row.period) {
			continue;
		}

		const totals = ensurePeriodTotals(periodTotals, row.period);
		const total = safeToNumber(row.totalAmount);
		const refund = safeToNumber(row.refundAmount);
		const isSettled = row.isSettled === true;

		totals.reembolsos += Math.abs(refund);
		if (isSettled) totals.reembolsosRealizados += Math.abs(refund);

		if (row.transactionType === TRANSACTION_TYPE_INCOME) {
			totals.receitas += total;
			if (isSettled) totals.receitasRealizadas += total;
		} else if (row.transactionType === TRANSACTION_TYPE_EXPENSE) {
			totals.despesas += Math.abs(total);
			if (isSettled) totals.despesasRealizadas += Math.abs(total);
		} else if (
			row.transactionType === TRANSACTION_TYPE_TRANSFER &&
			row.accountExcludeFromBalance === false
		) {
			totals.transferAdjustment += total;
		}
	}

	return periodTotals;
};

export async function fetchDashboardPeriodOverview(
	userId: string,
	period: string,
): Promise<DashboardPeriodOverview> {
	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	if (!adminPayerId) {
		return emptyOverview(period);
	}

	const previousPeriod = getPreviousPeriod(period);
	const chartPeriods = generateLast6Months(period);
	const startPeriod = addMonthsToPeriod(period, -24);

	const rows = await callRpc<PeriodOverviewRow>("get_period_overview", {
		p_user_id: dataOwnerUserId,
		p_admin_payer_id: adminPayerId,
		p_start_period: startPeriod,
		p_end_period: period,
	});

	/*
	 * O RPC só separa efetivado de previsto depois da migration
	 * `20260902100000_rpc_period_overview_realizado`. Sem ela a coluna nem vem, e
	 * tratar tudo como não efetivado zeraria os dois cards — então a versão
	 * antiga continua se comportando como antes, com um número só.
	 */
	const hasSettledFlag = rows.some((row) => row.realizado !== undefined);

	const periodTotals = buildPeriodTotals(
		rows.map((row) => ({
			period: row.periodo,
			transactionType: row.tipo_transacao ?? "",
			isSettled: hasSettledFlag ? row.realizado : true,
			totalAmount: row.total_amount,
			refundAmount: row.refund_amount,
			accountExcludeFromBalance: row.conta_excluir_do_saldo,
		})),
	);

	ensurePeriodTotals(periodTotals, period);
	ensurePeriodTotals(periodTotals, previousPeriod);

	const earliestPeriod =
		periodTotals.size > 0 ? Array.from(periodTotals.keys()).sort()[0] : period;
	const startRangePeriod =
		comparePeriods(earliestPeriod, previousPeriod) <= 0
			? earliestPeriod
			: previousPeriod;
	const periodRange = buildPeriodRange(startRangePeriod, period);
	const forecastByPeriod = new Map<string, number>();
	let runningForecast = 0;

	for (const key of periodRange) {
		const totals = ensurePeriodTotals(periodTotals, key);
		const netExpenses = Math.max(0, totals.despesas - totals.reembolsos);
		const netSettledExpenses = Math.max(
			0,
			totals.despesasRealizadas - totals.reembolsosRealizados,
		);
		totals.balanco =
			totals.receitas -
			totals.despesas +
			totals.reembolsos +
			totals.transferAdjustment;
		runningForecast += totals.balanco;
		totals.despesas = netExpenses;
		totals.despesasRealizadas = netSettledExpenses;
		forecastByPeriod.set(key, runningForecast);
	}

	const currentTotals = ensurePeriodTotals(periodTotals, period);
	const previousTotals = ensurePeriodTotals(periodTotals, previousPeriod);
	const months: MonthData[] = chartPeriods.map((chartPeriod) => {
		const entry = periodTotals.get(chartPeriod) ?? createEmptyTotals();

		return {
			month: chartPeriod,
			monthLabel: formatPeriodMonthShort(chartPeriod).toLowerCase(),
			income: entry.receitas,
			expense: entry.despesas,
			balance: entry.balanco,
		};
	});

	return {
		metrics: {
			period,
			previousPeriod,
			/*
			 * O card mostra o que entrou de fato e, ao lado, a previsão do mês. O
			 * total sozinho dizia "entradas do período" para dinheiro que ainda não
			 * entrou — em setembro/2026, R$ 33.000,00 num mês sem nenhuma entrada.
			 */
			receitas: {
				current: currentTotals.receitasRealizadas,
				previous: previousTotals.receitasRealizadas,
				forecast: hasSettledFlag ? currentTotals.receitas : undefined,
			},
			despesas: {
				current: currentTotals.despesasRealizadas,
				previous: previousTotals.despesasRealizadas,
				forecast: hasSettledFlag ? currentTotals.despesas : undefined,
			},
			balanco: {
				current: currentTotals.balanco,
				previous: previousTotals.balanco,
			},
			previsto: {
				current: forecastByPeriod.get(period) ?? runningForecast,
				previous: forecastByPeriod.get(previousPeriod) ?? 0,
			},
		},
		incomeExpenseBalanceData: { months },
	};
}
