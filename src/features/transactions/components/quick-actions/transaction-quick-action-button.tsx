"use client";

import type { ComponentProps } from "react";
import {
	monthToolbarIconClassName,
	monthToolbarMobileCellClassName,
	monthToolbarMobileLabelClassName,
} from "@/features/transactions/lib/month-toolbar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";
import {
	TRANSACTION_QUICK_ACTIONS,
	type TransactionQuickActionKind,
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
	const { label, shortLabel, Icon, iconClassName } =
		TRANSACTION_QUICK_ACTIONS[kind];

	return (
		<Button
			variant="ghost"
			className={cn(monthToolbarMobileCellClassName, className)}
			{...props}
		>
			<Icon
				className={cn(monthToolbarIconClassName, iconClassName)}
				aria-hidden
			/>
			<span className={cn(monthToolbarMobileLabelClassName, "md:hidden")}>
				{shortLabel}
			</span>
			<span className={cn(monthToolbarMobileLabelClassName, "hidden md:inline")}>
				{label}
			</span>
		</Button>
	);
}
