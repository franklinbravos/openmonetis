"use client";

import { RiArrowRightDownLine, RiArrowRightLine, RiArrowRightUpLine } from "@remixicon/react";
import { usePrivacyMode } from "@/shared/components/providers/privacy-provider";
import { formatCurrency, formatCurrencyCompact } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

export type MoneyVariant =
	| "neutral"
	| "income"
	| "expense"
	| "transfer"
	| "balance"
	| "delta"
	| "inflow"
	| "outflow"
	| "available"
	| "exceeded";

export type MoneySign = "auto" | "positive" | "signed" | "none";

export type MoneySize = "sm" | "md" | "lg" | "hero" | "inherit";

type MoneyProps = {
	amount: number;
	variant?: MoneyVariant;
	sign?: MoneySign;
	compact?: boolean;
	privacy?: boolean;
	size?: MoneySize;
	className?: string;
	showIcon?: boolean;
};

const sizeClasses: Record<Exclude<MoneySize, "inherit">, string> = {
	sm: "text-[13px] font-medium",
	md: "text-[15px] font-medium",
	lg: "text-xl font-semibold",
	hero: "text-[32px] font-semibold leading-[38px] tracking-[-0.02em]",
};

function getVariantClassName(variant: MoneyVariant, amount: number): string {
	switch (variant) {
		case "income":
		case "inflow":
		case "available":
			return "text-positive";
		case "outflow":
		case "exceeded":
			return "text-negative";
		case "transfer":
			return "text-info";
		case "expense":
		case "neutral":
			return "text-foreground";
		case "balance":
			if (amount > 0) return "text-positive";
			if (amount < 0) return "text-negative";
			return "text-foreground";
		case "delta":
			if (amount > 0) return "text-positive";
			if (amount < 0) return "text-negative";
			return "text-muted-foreground";
		default:
			return "text-foreground";
	}
}

function formatSignedValue(
	amount: number,
	sign: MoneySign,
	variant: MoneyVariant,
	compact: boolean,
): string {
	const formatter = compact ? formatCurrencyCompact : formatCurrency;
	const absoluteFormatted = formatter(Math.abs(amount));

	if (amount === 0) {
		return formatter(0);
	}

	if (sign === "none") {
		return absoluteFormatted;
	}

	if (sign === "signed") {
		return amount > 0 ? `+${absoluteFormatted}` : `−${absoluteFormatted}`;
	}

	if (sign === "positive") {
		return amount > 0 ? `+${absoluteFormatted}` : absoluteFormatted;
	}

	// auto
	if (variant === "income" || variant === "inflow" || variant === "available") {
		return amount > 0 ? `+${absoluteFormatted}` : absoluteFormatted;
	}

	if (variant === "balance" || variant === "delta") {
		return amount > 0 ? `+${absoluteFormatted}` : `−${absoluteFormatted}`;
	}

	return absoluteFormatted;
}

function DirectionIcon({
	amount,
	variant,
}: {
	amount: number;
	variant: MoneyVariant;
}) {
	if (amount === 0) return null;

	const coloredVariants: MoneyVariant[] = [
		"income",
		"expense",
		"balance",
		"delta",
		"inflow",
		"outflow",
		"available",
		"exceeded",
	];

	if (!coloredVariants.includes(variant)) {
		return null;
	}

	if (variant === "transfer") {
		return <RiArrowRightLine className="size-3.5 shrink-0" aria-hidden />;
	}

	if (amount > 0) {
		return <RiArrowRightUpLine className="size-3.5 shrink-0" aria-hidden />;
	}

	return <RiArrowRightDownLine className="size-3.5 shrink-0" aria-hidden />;
}

export function Money({
	amount,
	variant = "neutral",
	sign = "auto",
	compact = false,
	privacy = true,
	size = "inherit",
	className,
	showIcon = true,
}: MoneyProps) {
	const { privacyMode } = usePrivacyMode();
	const shouldHide = privacy && privacyMode;
	const displayValue = formatSignedValue(amount, sign, variant, compact);
	const privacyMask = "••••";

	return (
		<span
			className={cn(
				"font-mono-money inline-flex items-center gap-1",
				size !== "inherit" && sizeClasses[size],
				getVariantClassName(variant, amount),
				shouldHide && "select-none",
				className,
			)}
			aria-label={shouldHide ? "Valor oculto" : displayValue}
			data-privacy={shouldHide ? "hidden" : undefined}
			title={shouldHide ? "Valor oculto — passe o mouse para revelar" : undefined}
		>
			{showIcon && !shouldHide ? (
				<DirectionIcon amount={amount} variant={variant} />
			) : null}
			<span className={cn(shouldHide && "blur-sm hover:blur-none focus-within:blur-none")}>
				{shouldHide ? privacyMask : displayValue}
			</span>
		</span>
	);
}

type LegacyMoneyValuesProps = {
	amount: number;
	className?: string;
	showPositiveSign?: boolean;
	variant?: MoneyVariant;
};

/** @deprecated Use `Money` com props `variant` e `sign`. */
function MoneyValues({
	amount,
	className,
	showPositiveSign = false,
	variant,
}: LegacyMoneyValuesProps) {
	return (
		<Money
			amount={amount}
			className={className}
			variant={variant ?? (showPositiveSign ? "income" : "neutral")}
			sign={showPositiveSign ? "positive" : "auto"}
		/>
	);
}

export default MoneyValues;
export { MoneyValues };
