import { isAccountBalanceAdjustmentName } from "@/shared/lib/accounts/constants";
import {
	addMonthsToPeriod,
	derivePeriodFromDate,
	getPeriodPurchaseDateBounds,
} from "@/shared/utils/period";
import { roundMoney, SOURCE_ROUNDING_TOLERANCE } from "./invoice-total";

/** Saldos declarados no topo do extrato de conta (ex.: Nubank PDF). */
export type AccountStatementBalances = {
	openingBalance: number;
	closingBalance: number;
	yield?: number;
	/** Entradas e saídas declaradas no bloco de saldos, em módulo. */
	totalIn?: number | null;
	totalOut?: number | null;
	periodFrom: string;
	periodTo: string;
	/** O bloco do arquivo fecha: inicial + rendimento + entradas − saídas = final. */
	balances: boolean;
};

export function deriveStatementPeriodFromBalances(
	balances: AccountStatementBalances,
): string {
	return derivePeriodFromDate(balances.periodFrom);
}

export function getPreviousPeriodLastDate(statementPeriod: string): string {
	const previousPeriod = addMonthsToPeriod(statementPeriod, -1);
	return getPeriodPurchaseDateBounds(previousPeriod).end;
}

/**
 * Onde o ajuste de saldo fica ao importar um extrato: na véspera do mês.
 *
 * O ajuste é andaime, não lançamento: ele existe só para impor a abertura que o
 * banco declara, enquanto os meses anteriores ainda não foram importados. Por
 * isso mora sempre no **último dia do mês anterior** ao extrato — o ponto em
 * que o cadastro precisa valer o que o banco diz.
 *
 * E é o que faz a importação para trás funcionar sozinha: importar agosto põe o
 * ajuste em 31/07; importar julho depois encontra esse ajuste no próprio mês do
 * extrato, empurra-o para 30/06 e recalcula o valor pela abertura de julho.
 * Julho e agosto passam a ser movimento real, e o andaime recua um mês. Repetindo
 * mês a mês, o ajuste encolhe até sumir quando o primeiro extrato entrar.
 */
export function resolveBalanceAdjustmentPlacement(statementPeriod: string): {
	period: string;
	date: string;
} {
	return {
		period: addMonthsToPeriod(statementPeriod, -1),
		date: getPreviousPeriodLastDate(statementPeriod),
	};
}

export function isAccountBalanceAdjustmentLabel(
	label: string | null | undefined,
): boolean {
	return isAccountBalanceAdjustmentName(label);
}

export function shouldRelocateBalanceAdjustmentRow(
	date: string,
	description: string,
	statementPeriod: string,
): boolean {
	return (
		derivePeriodFromDate(date) === statementPeriod &&
		isAccountBalanceAdjustmentLabel(description)
	);
}

type ImportRowAmount = {
	date: string;
	description: string;
	amount: number;
	transactionType: "income" | "expense";
};

/** Rendimento declarado no cabeçalho mas ausente nas linhas importadas. */
export function computeStatementYieldGap(
	balances: AccountStatementBalances,
	rows: ImportRowAmount[],
): number {
	const yieldAmount = balances.yield ?? 0;
	if (yieldAmount <= 0.01) return 0;

	const hasYieldRow = rows.some(
		(row) =>
			/rendimento/i.test(row.description) &&
			Math.abs(row.amount - yieldAmount) <= SOURCE_ROUNDING_TOLERANCE,
	);

	return hasYieldRow ? 0 : roundMoney(yieldAmount);
}

export function signedImportRowAmount(row: ImportRowAmount): number {
	return row.transactionType === "expense" ? -row.amount : row.amount;
}

/** Variação líquida esperada no mês, segundo o arquivo. */
export function expectedStatementMonthNet(
	balances: AccountStatementBalances,
): number {
	return roundMoney(balances.closingBalance - balances.openingBalance);
}

/** Soma líquida das linhas do extrato no mês declarado (exclui ajustes a relocar). */
export function computeStatementMonthNetFromFileRows(
	rows: ImportRowAmount[],
	statementPeriod: string,
): number {
	return roundMoney(
		rows.reduce((total, row) => {
			if (
				shouldRelocateBalanceAdjustmentRow(
					row.date,
					row.description,
					statementPeriod,
				)
			) {
				return total;
			}
			if (derivePeriodFromDate(row.date) !== statementPeriod) return total;
			return total + signedImportRowAmount(row);
		}, 0),
	);
}
