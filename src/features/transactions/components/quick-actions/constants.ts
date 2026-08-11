import {
	type RemixiconComponentType,
	RiAddCircleFill,
	RiExchangeLine,
	RiSubtractLine,
} from "@remixicon/react";

export type TransactionQuickActionKind = "income" | "expense" | "transfer";

type QuickActionConfig = {
	label: string;
	shortLabel: string;
	Icon: RemixiconComponentType;
	variant: "default" | "outline";
	iconClassName: string;
};

export const TRANSACTION_QUICK_ACTIONS: Record<
	TransactionQuickActionKind,
	QuickActionConfig
> = {
	income: {
		label: "Nova Receita",
		shortLabel: "Receita",
		Icon: RiAddCircleFill,
		variant: "outline",
		iconClassName: "size-5 shrink-0 text-success",
	},
	expense: {
		label: "Nova Despesa",
		shortLabel: "Despesa",
		Icon: RiSubtractLine,
		variant: "outline",
		iconClassName: "size-5 shrink-0 text-destructive",
	},
	transfer: {
		label: "Nova transferência",
		shortLabel: "Transferir",
		Icon: RiExchangeLine,
		variant: "outline",
		iconClassName: "size-5 shrink-0 text-info",
	},
};

export const transactionQuickActionButtonClassName =
	"flex h-9 min-h-9 w-auto min-w-[4.25rem] flex-none flex-col items-center justify-center gap-0.5 whitespace-normal border bg-card px-2 py-1.5 text-[11px] font-medium leading-tight shadow-xs hover:bg-accent/40 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm";
