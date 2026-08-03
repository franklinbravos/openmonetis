export const RECONCILIATION_MODES = {
	CARD_CLOSE: "card_close",
	ACCOUNT_CLOSE: "account_close",
	BULK: "bulk",
} as const;

export const RECONCILIATION_TARGET_TYPES = {
	CARD: "card",
	ACCOUNT: "account",
} as const;

export const RECONCILIATION_STATUSES = {
	DRAFT: "draft",
	ANALYZED: "analyzed",
	APPLIED: "applied",
	CANCELLED: "cancelled",
} as const;

export const RECONCILIATION_MATCH_STATUSES = {
	PENDING: "pending",
	MATCHED: "matched",
	AMOUNT_DIFF: "amount_diff",
	MISSING_IN_SYSTEM: "missing_in_system",
	EXTRA_IN_SYSTEM: "extra_in_system",
	IGNORED: "ignored",
} as const;

export const RECONCILIATION_ALIAS_SOURCES = {
	MANUAL: "manual",
	CONFIRMED: "confirmed",
	AI: "ai",
} as const;

export type ReconciliationMode =
	(typeof RECONCILIATION_MODES)[keyof typeof RECONCILIATION_MODES];

export type ReconciliationTargetType =
	(typeof RECONCILIATION_TARGET_TYPES)[keyof typeof RECONCILIATION_TARGET_TYPES];
