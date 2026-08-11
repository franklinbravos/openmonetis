import { eq } from "drizzle-orm";
import { financialAccounts } from "@/db/schema";
import { db } from "@/shared/lib/db";

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
		where: eq(financialAccounts.userId, userId),
	});
}
