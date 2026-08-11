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
	"flex flex-col gap-2 sm:gap-2.5 md:h-11 md:flex-row md:items-stretch md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-card md:shadow-xs";

export const monthToolbarCreateGroupClassName =
	"grid w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 md:flex md:h-full md:w-auto md:max-w-none md:shrink-0 md:grid-cols-none md:gap-0 md:divide-x md:divide-border md:overflow-hidden md:rounded-none md:border-0 md:bg-transparent md:shadow-none";

export const monthToolbarMassAddClassName =
	"flex h-11 min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-card px-1 py-1.5 text-[10px] font-medium leading-tight text-muted-foreground shadow-xs hover:bg-accent/50 md:h-full md:min-h-0 md:w-auto md:flex-row md:gap-1.5 md:rounded-none md:border-0 md:px-3 md:py-0 md:text-sm md:text-foreground md:shadow-none md:hover:bg-accent/40";

export const monthToolbarFiltersGroupClassName =
	"flex w-full min-w-0 flex-1 items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-xs sm:gap-1 md:h-full md:items-stretch md:gap-0 md:divide-x md:divide-border md:rounded-none md:border-0 md:border-l md:border-border md:bg-transparent md:p-0 md:shadow-none";

export const monthToolbarDesktopActionClassName =
	"md:h-full md:min-h-0 md:rounded-none md:border-0 md:px-3 md:py-0 md:shadow-none";

export const monthToolbarMobileActionsClassName =
	"grid w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 md:hidden";

export const monthToolbarMobileCellClassName =
	"relative flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-card px-1 py-1.5 text-[10px] font-medium leading-tight text-muted-foreground shadow-xs hover:bg-accent/50 md:h-9 md:min-h-0 md:flex-row md:gap-2 md:rounded-md md:border-0 md:bg-transparent md:px-3 md:py-2 md:text-sm md:shadow-none";

export const monthToolbarIconButtonClassName =
	"relative flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-card px-1 py-1.5 text-[10px] font-medium leading-tight text-muted-foreground shadow-xs hover:bg-accent/50 md:size-9 md:gap-0 md:rounded-md md:border-0 md:bg-transparent md:p-0 md:shadow-none";

export const monthToolbarIconClassName = "size-5 shrink-0 text-primary md:size-5";
