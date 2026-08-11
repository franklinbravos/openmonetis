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
	"flex h-11 min-h-11 w-full flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg border border-border bg-card px-1 py-1.5 text-[10px] font-medium leading-tight text-muted-foreground shadow-xs hover:bg-accent/50 md:h-full md:min-h-0 md:w-auto md:min-w-0 md:flex-none md:flex-row md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:px-3 md:py-0 md:text-sm md:text-foreground md:opacity-100 md:shadow-none md:hover:bg-accent/40";
