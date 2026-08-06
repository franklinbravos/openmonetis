import { and, eq, inArray } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import type {
	TransferAccountPreview,
	TransferPeerAccountFields,
} from "@/shared/lib/transfers/utils";

type TransferEnrichableRow = {
	transferId?: string | null;
	userId?: string;
};

export async function enrichTransactionsWithTransferPeers<
	T extends TransferEnrichableRow,
>(rows: T[]): Promise<Array<T & Partial<TransferPeerAccountFields>>> {
	const transferIds = [
		...new Set(
			rows
				.map((row) => row.transferId)
				.filter((id): id is string => Boolean(id)),
		),
	];

	if (transferIds.length === 0) return rows;

	const userId = rows.find((row) => row.userId)?.userId;
	if (!userId) return rows;

	const legs = await db
		.select({
			transferId: transactions.transferId,
			amount: transactions.amount,
			accountId: transactions.accountId,
			accountName: financialAccounts.name,
			accountLogo: financialAccounts.logo,
		})
		.from(transactions)
		.innerJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				inArray(transactions.transferId, transferIds),
			),
		);

	const transferMap = new Map<
		string,
		{
			from: TransferAccountPreview;
			to: TransferAccountPreview;
		}
	>();

	for (const transferId of transferIds) {
		const group = legs.filter((leg) => leg.transferId === transferId);
		const outgoing = group.find((leg) => Number(leg.amount) < 0);
		const incoming = group.find((leg) => Number(leg.amount) > 0);

		if (!outgoing || !incoming) continue;

		transferMap.set(transferId, {
			from: {
				id: outgoing.accountId,
				name: outgoing.accountName,
				logo: outgoing.accountLogo,
			},
			to: {
				id: incoming.accountId,
				name: incoming.accountName,
				logo: incoming.accountLogo,
			},
		});
	}

	return rows.map((row) => {
		if (!row.transferId) return row;

		const pair = transferMap.get(row.transferId);
		if (!pair) return row;

		return {
			...row,
			transferFromAccountId: pair.from.id,
			transferFromAccountName: pair.from.name,
			transferFromAccountLogo: pair.from.logo,
			transferToAccountId: pair.to.id,
			transferToAccountName: pair.to.name,
			transferToAccountLogo: pair.to.logo,
		};
	});
}
