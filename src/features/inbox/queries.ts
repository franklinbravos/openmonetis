import { and, desc, eq } from "drizzle-orm";
import { cards, financialAccounts, inboxItems } from "@/db/schema";
import type {
	InboxItem,
	InboxPaginationState,
	InboxStatus,
	InboxStatusCounts,
	SelectOption,
} from "@/features/inbox/components/types";
import {
	buildOptionSets,
	buildSluggedFilters,
} from "@/features/transactions/lib/page-helpers";
import {
	fetchRecentEstablishments,
	fetchTransactionFilterSources,
} from "@/features/transactions/queries";
import { db } from "@/shared/lib/db";
import { callRpc, toRpcNumber } from "@/shared/lib/supabase/rpc";

type InboxCountRow = {
	total: string | number | null;
};

type InboxStatusCountRow = {
	status: string;
	total: string | number | null;
};

export async function fetchInboxItemsPage(
	userId: string,
	status: InboxStatus,
	{
		page,
		pageSize,
		sourceApp,
	}: {
		page: number;
		pageSize: number;
		sourceApp?: string | null;
	},
): Promise<{
	items: InboxItem[];
	pagination: InboxPaginationState;
}> {
	const where = and(
		eq(inboxItems.userId, userId),
		eq(inboxItems.status, status),
		sourceApp ? eq(inboxItems.sourceAppName, sourceApp) : undefined,
	);

	const [countRow] = await callRpc<InboxCountRow>("get_inbox_count", {
		p_user_id: userId,
		p_status: status,
		p_source_app_name: sourceApp ?? null,
	});

	const totalItems = toRpcNumber(countRow?.total);
	const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
	const currentPage = Math.min(page, totalPages);
	const offset = (currentPage - 1) * pageSize;

	const items = await db
		.select()
		.from(inboxItems)
		.where(where)
		.orderBy(desc(inboxItems.notificationTimestamp), desc(inboxItems.createdAt))
		.limit(pageSize)
		.offset(offset);

	return {
		items,
		pagination: {
			page: currentPage,
			pageSize,
			totalItems,
			totalPages,
		},
	};
}

export async function fetchInboxSourceApps(
	userId: string,
	status: InboxStatus,
): Promise<string[]> {
	const rows = await db
		.selectDistinct({ name: inboxItems.sourceAppName })
		.from(inboxItems)
		.where(and(eq(inboxItems.userId, userId), eq(inboxItems.status, status)));

	return rows
		.map((row) => row.name)
		.filter((name): name is string => name !== null)
		.sort();
}

export async function fetchInboxStatusCounts(
	userId: string,
): Promise<InboxStatusCounts> {
	const rows = await callRpc<InboxStatusCountRow>("get_inbox_status_counts", {
		p_user_id: userId,
	});

	const counts: InboxStatusCounts = {
		pending: 0,
		processed: 0,
		discarded: 0,
	};

	for (const row of rows) {
		if (row.status in counts) {
			counts[row.status as InboxStatus] = toRpcNumber(row.total);
		}
	}

	return counts;
}

export async function fetchAppLogoMap(
	userId: string,
): Promise<Record<string, string>> {
	const [userCartoes, userContas] = await Promise.all([
		db
			.select({ name: cards.name, logo: cards.logo })
			.from(cards)
			.where(eq(cards.userId, userId)),
		db
			.select({ name: financialAccounts.name, logo: financialAccounts.logo })
			.from(financialAccounts)
			.where(eq(financialAccounts.userId, userId)),
	]);

	const logoMap: Record<string, string> = {};

	for (const item of [...userCartoes, ...userContas]) {
		if (item.logo) {
			logoMap[item.name.toLowerCase()] = item.logo;
		}
	}

	return logoMap;
}

export async function fetchPendingInboxCount(userId: string): Promise<number> {
	const [result] = await callRpc<InboxCountRow>("get_inbox_count", {
		p_user_id: userId,
		p_status: "pending",
		p_source_app_name: null,
	});

	return toRpcNumber(result?.total);
}

/**
 * Fetch all data needed for the TransactionDialog in inbox context
 */
export async function fetchInboxDialogData(userId: string): Promise<{
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	estabelecimentos: string[];
}> {
	const filterSources = await fetchTransactionFilterSources(userId);
	const sluggedFilters = buildSluggedFilters(filterSources);

	const {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
	} = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	const estabelecimentos = await fetchRecentEstablishments(userId);

	return {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
		estabelecimentos,
	};
}
