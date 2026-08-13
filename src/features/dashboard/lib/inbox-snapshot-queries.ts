import { and, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cards, financialAccounts, inboxItems } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { callRpc, toRpcNumber } from "@/shared/lib/supabase/rpc";

type InboxCountRow = {
	total: string | number | null;
};

type DashboardInboxItem = {
	id: string;
	sourceAppName: string | null;
	parsedName: string | null;
	parsedAmount: string | null;
	originalText: string;
	notificationTimestamp: Date;
	createdAt: Date;
};

export type DashboardInboxSnapshot = {
	pendingCount: number;
	recentItems: DashboardInboxItem[];
	logoMap: Record<string, string>;
};

export async function fetchDashboardInboxSnapshot(
	userId: string,
): Promise<DashboardInboxSnapshot> {
	"use cache";
	cacheTag(`dashboard-${userId}`);
	cacheLife({ revalidate: 3 });

	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	const [countRows, items, userCards, userAccounts] = await Promise.all([
		callRpc<InboxCountRow>("get_inbox_count", {
			p_user_id: userId,
			p_status: "pending",
			p_source_app_name: null,
		}),
		db
			.select({
				id: inboxItems.id,
				sourceAppName: inboxItems.sourceAppName,
				parsedName: inboxItems.parsedName,
				parsedAmount: inboxItems.parsedAmount,
				originalText: inboxItems.originalText,
				notificationTimestamp: inboxItems.notificationTimestamp,
				createdAt: inboxItems.createdAt,
			})
			.from(inboxItems)
			.where(
				and(eq(inboxItems.userId, userId), eq(inboxItems.status, "pending")),
			)
			.orderBy(desc(inboxItems.notificationTimestamp))
			.limit(10),
		db
			.select({ name: cards.name, logo: cards.logo })
			.from(cards)
			.where(eq(cards.userId, dataOwnerUserId)),
		db
			.select({ name: financialAccounts.name, logo: financialAccounts.logo })
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, dataOwnerUserId)),
	]);

	const logoMap: Record<string, string> = {};
	for (const item of [...userCards, ...userAccounts]) {
		if (item.logo) {
			logoMap[item.name.toLowerCase()] = item.logo;
		}
	}

	return {
		pendingCount: toRpcNumber(countRows[0]?.total),
		recentItems: items,
		logoMap,
	};
}
