import { isAccountInactive } from "@/shared/lib/accounts/constants";
import {
	type AccountWithoutMovements,
	fetchAccountsWithoutMovements,
} from "@/shared/lib/accounts/queries";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { safeToNumber as toNumber } from "@/shared/utils/number";

type AccountBalancesRow = {
	id: string;
	nome: string;
	tipo_conta: string;
	status: string;
	anotacao: string | null;
	logo: string;
	saldo_inicial: string | number | null;
	excluir_do_saldo: boolean;
	excluir_saldo_inicial_receitas: boolean;
	saldo_movimentacoes: string | number | null;
};

export type DashboardAccount = {
	id: string;
	name: string;
	accountType: string;
	status: string;
	logo: string | null;
	initialBalance: number;
	balance: number;
	excludeFromBalance: boolean;
};

type DashboardAccountsSnapshot = {
	totalBalance: number;
	accounts: DashboardAccount[];
};

const toDashboardAccount = (row: AccountBalancesRow): DashboardAccount => {
	const initialBalance = toNumber(row.saldo_inicial);

	return {
		id: row.id,
		name: row.nome,
		accountType: row.tipo_conta,
		status: row.status,
		logo: row.logo,
		initialBalance,
		balance: initialBalance + toNumber(row.saldo_movimentacoes),
		excludeFromBalance: row.excluir_do_saldo,
	};
};

const toDashboardAccountWithoutMovements = (
	row: AccountWithoutMovements,
): DashboardAccount => {
	const initialBalance = toNumber(row.initialBalance);

	return {
		id: row.id,
		name: row.name,
		accountType: row.accountType,
		status: row.status,
		logo: row.logo,
		initialBalance,
		balance: initialBalance,
		excludeFromBalance: row.excludeFromBalance,
	};
};

export async function fetchDashboardAccounts(
	userId: string,
): Promise<DashboardAccountsSnapshot> {
	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);

	const accounts = adminPayerId
		? (
				await callRpc<AccountBalancesRow>("get_account_balances", {
					p_user_id: dataOwnerUserId,
					p_admin_payer_id: adminPayerId,
				})
			).map(toDashboardAccount)
		: (await fetchAccountsWithoutMovements(dataOwnerUserId)).map(
				toDashboardAccountWithoutMovements,
			);

	accounts.sort((left, right) => right.balance - left.balance);

	const totalBalance = accounts
		.filter(
			(account) =>
				!account.excludeFromBalance && !isAccountInactive(account.status),
		)
		.reduce((total, account) => total + account.balance, 0);

	return {
		totalBalance,
		accounts,
	};
}
