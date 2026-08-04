export const TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID = "transactions-month-toolbar";

export function getMonthToolbarExpandSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-expand`;
}

export function getMonthToolbarEndSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-end`;
}

export const monthToolbarIconButtonClassName =
	"relative size-8 shrink-0 border border-border bg-card shadow-xs hover:bg-accent/40 sm:size-9";

export const monthToolbarIconClassName = "size-5 text-primary";
