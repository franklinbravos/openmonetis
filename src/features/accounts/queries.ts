import { isAccountInactive } from "@/shared/lib/accounts/constants";
import {
	type AccountWithoutMovements,
	fetchAccountsWithoutMovements,
} from "@/shared/lib/accounts/queries";
import { loadLogoOptions } from "@/shared/lib/logo/options";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { safeToNumber } from "@/shared/utils/number";

export type AccountData = {
	id: string;
	name: string;
	accountType: string;
	status: string;
	note: string | null;
	logo: string | null;
	initialBalance: number;
	balance: number;
	excludeFromBalance: boolean;
	excludeInitialBalanceFromIncome: boolean;
};

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

const toAccountData = (row: AccountBalancesRow): AccountData => {
	const initialBalance = safeToNumber(row.saldo_inicial);

	return {
		id: row.id,
		name: row.nome,
		accountType: row.tipo_conta,
		status: row.status,
		note: row.anotacao,
		logo: row.logo,
		initialBalance,
		balance: initialBalance + safeToNumber(row.saldo_movimentacoes),
		excludeFromBalance: row.excluir_do_saldo,
		excludeInitialBalanceFromIncome: row.excluir_saldo_inicial_receitas,
	};
};

const toAccountDataWithoutMovements = (
	row: AccountWithoutMovements,
): AccountData => {
	const initialBalance = safeToNumber(row.initialBalance);

	return {
		id: row.id,
		name: row.name,
		accountType: row.accountType,
		status: row.status,
		note: row.note,
		logo: row.logo,
		initialBalance,
		balance: initialBalance,
		excludeFromBalance: row.excludeFromBalance,
		excludeInitialBalanceFromIncome: row.excludeInitialBalanceFromIncome,
	};
};

export async function fetchAllAccountsForUser(userId: string): Promise<{
	activeAccounts: AccountData[];
	archivedAccounts: AccountData[];
	logoOptions: string[];
}> {
	const adminPayerId = await getAdminPayerId(userId);

	const [accountRows, logoOptions] = await Promise.all([
		adminPayerId
			? callRpc<AccountBalancesRow>("get_account_balances", {
					p_user_id: userId,
					p_admin_payer_id: adminPayerId,
				}).then((rows) => rows.map(toAccountData))
			: fetchAccountsWithoutMovements(userId).then((rows) =>
					rows.map(toAccountDataWithoutMovements),
				),
		loadLogoOptions(),
	]);

	return {
		activeAccounts: accountRows.filter(
			(account) => !isAccountInactive(account.status),
		),
		archivedAccounts: accountRows.filter((account) =>
			isAccountInactive(account.status),
		),
		logoOptions,
	};
}
