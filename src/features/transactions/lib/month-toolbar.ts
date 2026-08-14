import { cn } from "@/shared/utils/ui";

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

export function getMonthToolbarMobileActionsSlotId(toolbarSlotId: string) {
	return `${toolbarSlotId}-mobile-actions`;
}

export const monthToolbarPanelClassName =
	"flex w-full flex-col gap-1.5 md:h-11 md:flex-row md:items-stretch md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-card md:shadow-xs";

export const monthToolbarCreateGroupClassName =
	"grid w-full min-w-0 grid-cols-4 gap-1 md:flex md:h-full md:w-auto md:max-w-none md:shrink-0 md:grid-cols-none md:gap-0 md:divide-x md:divide-border md:overflow-hidden";

export const monthToolbarFiltersGroupClassName =
	"flex w-full min-w-0 flex-1 items-center gap-0.5 md:h-full md:items-stretch md:gap-0 md:divide-x md:divide-border md:rounded-none md:border-0 md:border-l md:border-border md:bg-transparent md:p-0 md:shadow-none";

export const monthToolbarDesktopActionClassName =
	"md:h-full md:min-h-0 md:rounded-none md:border-0 md:px-3 md:py-0 md:shadow-none";

export type MonthToolbarMobileColumns = 3 | 4;

const monthToolbarMobileBarBaseClassName =
	"grid w-full min-w-0 gap-1 rounded-xl border border-border/80 bg-muted/20 p-1 shadow-xs md:flex md:items-stretch md:overflow-hidden md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:divide-x md:divide-border";

export function getMonthToolbarMobileBarClassName(
	columns: MonthToolbarMobileColumns = 4,
) {
	return cn(
		monthToolbarMobileBarBaseClassName,
		columns === 3 ? "grid-cols-3" : "grid-cols-4",
	);
}

export function getMonthToolbarMobileActionsClassName(
	columns: MonthToolbarMobileColumns = 4,
) {
	return cn(getMonthToolbarMobileBarClassName(columns), "md:hidden");
}

/** @deprecated Use getMonthToolbarMobileBarClassName() */
export const monthToolbarMobileBarClassName =
	getMonthToolbarMobileBarClassName(4);

/** @deprecated Use getMonthToolbarMobileActionsClassName() */
export const monthToolbarMobileActionsClassName =
	getMonthToolbarMobileActionsClassName(4);

export const monthToolbarMobileCellClassName =
	"relative flex h-11 min-h-11 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold leading-none text-muted-foreground transition-all hover:bg-card hover:text-foreground hover:shadow-xs active:scale-[0.98] md:h-full md:min-h-0 md:w-auto md:flex-none md:flex-row md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:px-3 md:py-0 md:text-sm md:font-medium md:leading-normal md:shadow-none md:hover:bg-accent/40 md:active:scale-100";

export const monthToolbarMobileLabelClassName =
	"max-w-full truncate text-center leading-none md:truncate-none";

export const monthToolbarIconButtonClassName =
	"relative flex h-11 min-h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-card hover:text-foreground hover:shadow-xs active:scale-[0.98] md:size-9 md:min-h-0 md:min-w-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:hover:bg-accent/40 md:active:scale-100";

export const monthToolbarIconClassName = "size-5 shrink-0 md:size-4";

/** @deprecated Use monthToolbarMobileCellClassName */
export const monthToolbarMassAddClassName = monthToolbarMobileCellClassName;
