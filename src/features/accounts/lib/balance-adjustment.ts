import { and, eq } from "drizzle-orm";
import { categories, transactions } from "@/db/schema";
import {
	ACCOUNT_BALANCE_ADJUSTMENT_NAME,
	INITIAL_BALANCE_CONDITION,
	INITIAL_BALANCE_PAYMENT_METHOD,
} from "@/shared/lib/accounts/constants";
import type { db as DbType } from "@/shared/lib/db";
import {
	formatCurrency,
	formatDecimalForDbRequired,
} from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";

type DbClient = typeof DbType;

export async function upsertAccountBalanceAdjustmentInTx(
	tx: DbClient,
	input: {
		dataOwnerUserId: string;
		accountId: string;
		period: string;
		purchaseDate: string;
		currentBalance: number;
		targetBalance: number;
		adminPayerId: string;
	},
): Promise<{ message: string; changed: boolean }> {
	const existing = await tx.query.transactions.findFirst({
		columns: { id: true, amount: true },
		where: and(
			eq(transactions.userId, input.dataOwnerUserId),
			eq(transactions.accountId, input.accountId),
			eq(transactions.period, input.period),
			eq(transactions.name, ACCOUNT_BALANCE_ADJUSTMENT_NAME),
		),
	});

	const existingAmount = Number(existing?.amount ?? 0);
	const baseBalance = input.currentBalance - existingAmount;
	const adjustmentAmount =
		Math.round((input.targetBalance - baseBalance) * 100) / 100;

	if (adjustmentAmount === 0) {
		if (existing) {
			await tx.delete(transactions).where(eq(transactions.id, existing.id));
			return { message: "Ajuste de saldo removido.", changed: true };
		}
		return {
			message: "Nada a ajustar — o saldo já está correto.",
			changed: false,
		};
	}

	const isExpense = adjustmentAmount < 0;
	const categoryName = isExpense ? "Outras despesas" : "Outras receitas";

	const category = await tx.query.categories.findFirst({
		columns: { id: true },
		where: and(
			eq(categories.userId, input.dataOwnerUserId),
			eq(categories.name, categoryName),
		),
	});

	const purchaseDate = parseLocalDateString(input.purchaseDate);
	if (Number.isNaN(purchaseDate.getTime())) {
		throw new Error("Data do ajuste inválida.");
	}

	const payload = {
		condition: INITIAL_BALANCE_CONDITION,
		name: ACCOUNT_BALANCE_ADJUSTMENT_NAME,
		paymentMethod: INITIAL_BALANCE_PAYMENT_METHOD,
		note: `O saldo era ${formatCurrency(baseBalance)} mas o correto é ${formatCurrency(input.targetBalance)}.`,
		amount: formatDecimalForDbRequired(adjustmentAmount),
		purchaseDate,
		transactionType: isExpense ? ("Despesa" as const) : ("Receita" as const),
		period: input.period,
		isSettled: true,
		userId: input.dataOwnerUserId,
		accountId: input.accountId,
		cardId: null,
		categoryId: category?.id ?? null,
		payerId: input.adminPayerId,
	};

	if (existing) {
		await tx
			.update(transactions)
			.set(payload)
			.where(eq(transactions.id, existing.id));
	} else {
		await tx.insert(transactions).values(payload);
	}

	return { message: "Ajuste de saldo registrado.", changed: true };
}
