export const TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID = "transactions-month-toolbar";

export function getMonthToolbarExpandSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-expand`;
}

export function getMonthToolbarCreateSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-create`;
}

export function getMonthToolbarEndSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-end`;
}

export function getMonthToolbarFiltersSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-filters`;
}

export const monthToolbarPanelClassName =
	"flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-2 sm:p-2.5";

export const monthToolbarCreateGroupClassName =
	"inline-flex max-w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-card shadow-xs";

export const monthToolbarFiltersGroupClassName =
	"flex w-full min-w-0 items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-xs sm:gap-1";

export const monthToolbarIconButtonClassName =
	"relative size-8 shrink-0 border-0 bg-transparent shadow-none hover:bg-accent/50 sm:size-9";

export const monthToolbarMobileToolsClassName =
	"flex w-full min-w-0 items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-xs sm:gap-1";

export const monthToolbarIconClassName = "size-5 text-primary";
