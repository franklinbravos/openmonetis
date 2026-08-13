import { and, eq } from "drizzle-orm";
import { type Category, categories, transactions } from "@/db/schema";
import type { CategoryType } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";

type CategoryData = {
	id: string;
	name: string;
	type: CategoryType;
	icon: string | null;
	parentId: string | null;
	sortOrder: number;
};

export async function fetchCategoriesForUser(
	userId: string,
): Promise<CategoryData[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const categoryRows = await db.query.categories.findMany({
		where: eq(categories.userId, dataOwnerUserId),
	});

	return categoryRows.map((category: Category) => ({
		id: category.id,
		name: category.name,
		type: category.type as CategoryType,
		icon: category.icon,
		parentId: category.parentId ?? null,
		sortOrder: category.sortOrder ?? 0,
	}));
}

export type CategoryLinkedTransaction = {
	id: string;
	name: string;
	purchaseDate: string;
	amount: number;
	transactionType: string;
	period: string;
};

export async function fetchCategoryLinkedTransactions(
	userId: string,
	categoryId: string,
): Promise<CategoryLinkedTransaction[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const rows = await db.query.transactions.findMany({
		columns: {
			id: true,
			name: true,
			purchaseDate: true,
			amount: true,
			transactionType: true,
			period: true,
		},
		where: and(
			eq(transactions.userId, dataOwnerUserId),
			eq(transactions.categoryId, categoryId),
		),
		limit: 500,
	});

	return rows
		.map((row) => ({
			id: row.id,
			name: row.name,
			purchaseDate:
				row.purchaseDate instanceof Date
					? row.purchaseDate.toISOString().slice(0, 10)
					: String(row.purchaseDate).slice(0, 10),
			amount: Number(row.amount ?? 0),
			transactionType: row.transactionType,
			period: row.period,
		}))
		.sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));
}
