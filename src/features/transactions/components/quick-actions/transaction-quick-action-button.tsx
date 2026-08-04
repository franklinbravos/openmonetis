"use client";

import type { ComponentProps } from "react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";
import {
	TRANSACTION_QUICK_ACTIONS,
	type TransactionQuickActionKind,
	transactionQuickActionButtonClassName,
} from "./constants";

type TransactionQuickActionButtonProps = Omit<
	ComponentProps<typeof Button>,
	"children" | "variant"
> & {
	kind: TransactionQuickActionKind;
};

export function TransactionQuickActionButton({
	kind,
	className,
	...props
}: TransactionQuickActionButtonProps) {
	const { label, shortLabel, Icon, variant, iconClassName } =
		TRANSACTION_QUICK_ACTIONS[kind];

	return (
		<Button
			variant={variant}
			className={cn(transactionQuickActionButtonClassName, className)}
			{...props}
		>
			<Icon className={iconClassName} aria-hidden />
			<span className="sm:hidden">{shortLabel}</span>
			<span className="hidden sm:inline">{label}</span>
		</Button>
	);
}
