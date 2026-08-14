import {
	type RemixiconComponentType,
	RiArrowLeftRightLine,
	RiArrowRightDownLine,
	RiArrowRightUpLine,
} from "@remixicon/react";

export type TransactionQuickActionKind = "income" | "expense" | "transfer";

type QuickActionConfig = {
	label: string;
	shortLabel: string;
	Icon: RemixiconComponentType;
	iconClassName: string;
};

export const TRANSACTION_QUICK_ACTIONS: Record<
	TransactionQuickActionKind,
	QuickActionConfig
> = {
	income: {
		label: "Nova Receita",
		shortLabel: "Receita",
		Icon: RiArrowRightDownLine,
		iconClassName: "text-success",
	},
	expense: {
		label: "Nova Despesa",
		shortLabel: "Despesa",
		Icon: RiArrowRightUpLine,
		iconClassName: "text-destructive",
	},
	transfer: {
		label: "Nova transferência",
		shortLabel: "Transferir",
		Icon: RiArrowLeftRightLine,
		iconClassName: "text-primary",
	},
};
