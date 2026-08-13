import { eq } from "drizzle-orm";
import { financialAccounts } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";

export type AccountWithoutMovements = {
	id: string;
	name: string;
	accountType: string;
	note: string | null;
	status: string;
	logo: string;
	initialBalance: string;
	excludeFromBalance: boolean;
	excludeInitialBalanceFromIncome: boolean;
};

export async function fetchAccountsWithoutMovements(
	userId: string,
): Promise<AccountWithoutMovements[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	return db.query.financialAccounts.findMany({
		columns: {
			id: true,
			name: true,
			accountType: true,
			note: true,
			status: true,
			logo: true,
			initialBalance: true,
			excludeFromBalance: true,
			excludeInitialBalanceFromIncome: true,
		},
		where: eq(financialAccounts.userId, dataOwnerUserId),
	});
}
