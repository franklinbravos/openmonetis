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
	"flex h-auto min-h-10 w-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-normal border bg-card px-1 py-2 text-[11px] font-medium leading-tight shadow-xs hover:bg-accent/40 sm:h-9 sm:w-auto sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm";
