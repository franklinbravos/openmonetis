import { asc, eq } from "drizzle-orm";
import { type Category, categories } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";

export async function fetchUserCategories(userId: string): Promise<Category[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	return db.query.categories.findMany({
		where: eq(categories.userId, dataOwnerUserId),
		orderBy: [asc(categories.name)],
	});
}
