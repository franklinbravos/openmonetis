const TRANSFER_NOTE_PATTERN = /^de (.+?) -> (.+)$/u;

export type TransferAccountPreview = {
	id: string | null;
	name: string;
	logo: string | null;
};

export type TransferAccountsPreview = {
	from: TransferAccountPreview;
	to: TransferAccountPreview;
};

export type TransferPeerAccountFields = {
	transferFromAccountId: string | null;
	transferFromAccountName: string | null;
	transferFromAccountLogo: string | null;
	transferToAccountId: string | null;
	transferToAccountName: string | null;
	transferToAccountLogo: string | null;
};

type TransferPreviewRow = {
	transactionType?: string;
	amount?: string | number | null;
	accountId?: string | null;
	note?: string | null;
	financialAccount?: {
		id?: string;
		name?: string | null;
		logo?: string | null;
	} | null;
};

export function resolveTransferAccountsPreview(
	row: Pick<
		TransferPreviewRow,
		"transactionType" | "amount" | "accountId" | "note" | "financialAccount"
	> &
		Partial<TransferPeerAccountFields>,
): TransferAccountsPreview | null {
	if (row.transactionType !== "Transferência") return null;

	if (row.transferFromAccountName && row.transferToAccountName) {
		return {
			from: {
				id: row.transferFromAccountId ?? null,
				name: row.transferFromAccountName,
				logo: row.transferFromAccountLogo ?? null,
			},
			to: {
				id: row.transferToAccountId ?? null,
				name: row.transferToAccountName,
				logo: row.transferToAccountLogo ?? null,
			},
		};
	}

	const match = row.note?.match(TRANSFER_NOTE_PATTERN);
	if (!match) return null;

	const [, fromName, toName] = match;
	const currentAccount = row.financialAccount;
	const amount = Number(row.amount ?? 0);

	if (amount < 0) {
		return {
			from: {
				id: currentAccount?.id ?? row.accountId ?? null,
				name: fromName,
				logo: currentAccount?.logo ?? null,
			},
			to: {
				id: null,
				name: toName,
				logo: null,
			},
		};
	}

	return {
		from: {
			id: null,
			name: fromName,
			logo: null,
		},
		to: {
			id: currentAccount?.id ?? row.accountId ?? null,
			name: toName,
			logo: currentAccount?.logo ?? null,
		},
	};
}
