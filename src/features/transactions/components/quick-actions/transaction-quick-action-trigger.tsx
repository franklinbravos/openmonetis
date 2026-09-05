"use client";

import {
	type RemixiconComponentType,
	RiArrowLeftRightLine,
	RiArrowRightDownLine,
	RiArrowRightUpLine,
} from "@remixicon/react";
import {
	type ComponentProps,
	createContext,
	type ReactNode,
	useContext,
} from "react";
import { TRANSACTION_QUICK_ACTIONS } from "@/features/transactions/components/quick-actions/constants";
import {
	monthToolbarIconClassName,
	monthToolbarMobileCellClassName,
	monthToolbarMobileLabelClassName,
} from "@/features/transactions/lib/month-toolbar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";
import type { TransactionQuickActionKind } from "./constants";

type TransactionQuickActionLayout = "default" | "toolbar";

const TransactionQuickActionLayoutContext =
	createContext<TransactionQuickActionLayout>("default");

export function TransactionQuickActionLayoutProvider({
	layout,
	children,
}: {
	layout: TransactionQuickActionLayout;
	children: ReactNode;
}) {
	return (
		<TransactionQuickActionLayoutContext.Provider value={layout}>
			{children}
		</TransactionQuickActionLayoutContext.Provider>
	);
}

function useTransactionQuickActionLayout() {
	return useContext(TransactionQuickActionLayoutContext);
}

type QuickActionUi = {
	Icon: RemixiconComponentType;
	label: string;
	shortLabel: string;
	surfaceClassName: string;
	iconRailClassName: string;
};

const QUICK_ACTION_UI: Record<TransactionQuickActionKind, QuickActionUi> = {
	income: {
		Icon: RiArrowRightDownLine,
		label: TRANSACTION_QUICK_ACTIONS.income.label,
		shortLabel: TRANSACTION_QUICK_ACTIONS.income.shortLabel,
		surfaceClassName:
			"border-success/30 bg-card text-foreground hover:border-success/45 hover:bg-success/6 active:bg-success/10 dark:border-success/25 dark:hover:bg-success/10",
		iconRailClassName:
			"bg-success/12 text-success group-hover:bg-success/18 dark:bg-success/16 dark:group-hover:bg-success/22",
	},
	expense: {
		Icon: RiArrowRightUpLine,
		label: TRANSACTION_QUICK_ACTIONS.expense.label,
		shortLabel: TRANSACTION_QUICK_ACTIONS.expense.shortLabel,
		surfaceClassName:
			"border-destructive/30 bg-card text-foreground hover:border-destructive/45 hover:bg-destructive/6 active:bg-destructive/10 dark:border-destructive/25 dark:hover:bg-destructive/10",
		iconRailClassName:
			"bg-destructive/10 text-destructive group-hover:bg-destructive/16 dark:bg-destructive/14 dark:group-hover:bg-destructive/20",
	},
	transfer: {
		Icon: RiArrowLeftRightLine,
		label: TRANSACTION_QUICK_ACTIONS.transfer.label,
		shortLabel: TRANSACTION_QUICK_ACTIONS.transfer.shortLabel,
		surfaceClassName:
			"border-primary/25 bg-card text-foreground hover:border-primary/40 hover:bg-primary/6 active:bg-primary/10 dark:border-primary/20 dark:hover:bg-primary/10",
		iconRailClassName:
			"bg-primary/10 text-primary group-hover:bg-primary/14 dark:bg-primary/14 dark:group-hover:bg-primary/20",
	},
};

export const transactionQuickActionButtonClassName =
	"group flex h-11 min-h-11 min-w-0 flex-1 basis-0 items-stretch justify-start gap-0 overflow-hidden rounded-xl border p-0 text-sm font-medium shadow-xs transition-all duration-200 hover:shadow-sm active:scale-[0.99] sm:h-9 sm:min-h-9 sm:flex-none sm:basis-auto";

function QuickActionLabel({
	label,
	shortLabel,
}: {
	label: string;
	shortLabel: string;
}) {
	return (
		<>
			<span className="sm:hidden">{shortLabel}</span>
			<span className="hidden sm:inline xl:hidden">{shortLabel}</span>
			<span className="hidden xl:inline">{label}</span>
		</>
	);
}

type TransactionQuickActionTriggerProps = {
	kind: TransactionQuickActionKind;
} & Omit<ComponentProps<typeof Button>, "children" | "variant">;

export function TransactionQuickActionTrigger({
	kind,
	className,
	...props
}: TransactionQuickActionTriggerProps) {
	const layout = useTransactionQuickActionLayout();
	const ui = QUICK_ACTION_UI[kind];
	const Icon = ui.Icon;
	const action = TRANSACTION_QUICK_ACTIONS[kind];

	if (layout === "toolbar") {
		return (
			<Button
				type="button"
				variant="ghost"
				className={cn(monthToolbarMobileCellClassName, className)}
				{...props}
			>
				<Icon
					className={cn(monthToolbarIconClassName, action.iconClassName)}
					aria-hidden
				/>
				<span className={monthToolbarMobileLabelClassName}>
					<QuickActionLabel label={ui.label} shortLabel={ui.shortLabel} />
				</span>
			</Button>
		);
	}

	return (
		<Button
			type="button"
			variant="ghost"
			className={cn(
				transactionQuickActionButtonClassName,
				ui.surfaceClassName,
				className,
			)}
			{...props}
		>
			<span
				className={cn(
					"flex w-10 shrink-0 items-center justify-center border-r border-border/50 transition-colors",
					ui.iconRailClassName,
				)}
			>
				<Icon className="size-4" aria-hidden />
			</span>
			<span className="flex min-w-0 flex-1 items-center justify-center px-2 text-center text-xs font-semibold leading-none sm:px-3 sm:text-sm sm:font-medium">
				<QuickActionLabel label={ui.label} shortLabel={ui.shortLabel} />
			</span>
		</Button>
	);
}
