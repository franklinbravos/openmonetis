"use client";

import { RiBankCard2Line, RiBankLine } from "@remixicon/react";
import Image from "next/image";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import StatusDot from "@/shared/components/feedback/status-dot";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { getAvatarSrc } from "@/shared/lib/payers/utils";
import { getConditionIcon, getPaymentMethodIcon } from "@/shared/utils/icons";
import { cn } from "@/shared/utils/ui";

type SelectItemContentProps = {
	label: string;
	avatarUrl?: string | null;
	logo?: string | null;
	icon?: string | null;
};

export function PayerSelectTriggerValue({
	label,
	avatarUrl,
	showLabel = false,
	avatarClassName,
}: SelectItemContentProps & {
	showLabel?: boolean;
	avatarClassName?: string;
}) {
	const avatarSrc = getAvatarSrc(avatarUrl);
	const initial = label.charAt(0).toUpperCase() || "?";

	return (
		<span
			className={cn(
				"flex min-w-0 items-center gap-2",
				!showLabel && "justify-center",
			)}
		>
			<Avatar
				className={cn(
					"size-6 shrink-0 border border-border/60 bg-background",
					avatarClassName,
				)}
			>
				<AvatarImage src={avatarSrc} alt={`Avatar de ${label}`} />
				<AvatarFallback className="text-xs font-medium uppercase">
					{initial}
				</AvatarFallback>
			</Avatar>
			<span className={showLabel ? "truncate" : "hidden"}>{label}</span>
		</span>
	);
}

export function PayerSelectContent({
	label,
	avatarUrl,
}: SelectItemContentProps) {
	const avatarSrc = getAvatarSrc(avatarUrl);
	const initial = label.charAt(0).toUpperCase() || "?";

	return (
		<span className="flex items-center gap-2">
			<Avatar className="size-6 border border-border/60 bg-background">
				<AvatarImage src={avatarSrc} alt={`Avatar de ${label}`} />
				<AvatarFallback className="text-xs font-medium uppercase">
					{initial}
				</AvatarFallback>
			</Avatar>
			<span>{label}</span>
		</span>
	);
}

export function CategorySelectContent({
	label,
	icon,
	depth = 0,
	pathLabel,
	truncateLabel = true,
}: SelectItemContentProps & {
	depth?: number;
	pathLabel?: string | null;
	truncateLabel?: boolean;
}) {
	return (
		<span
			className={cn("flex items-center gap-2", truncateLabel && "min-w-0")}
			style={{ paddingLeft: depth > 0 ? `${depth * 0.75}rem` : undefined }}
		>
			<CategoryIcon name={icon} className="size-4 shrink-0" />
			<span className={cn("flex flex-col", truncateLabel && "min-w-0")}>
				<span className={cn(truncateLabel && "truncate")}>{label}</span>
				{pathLabel && depth > 0 ? (
					<span
						className={cn(
							"text-muted-foreground text-xs",
							truncateLabel && "truncate",
						)}
					>
						{pathLabel}
					</span>
				) : null}
			</span>
		</span>
	);
}

export function TransactionTypeSelectContent({ label }: { label: string }) {
	const colorMap: Record<string, string> = {
		Receita: "bg-success",
		Despesa: "bg-destructive",
		Transferência: "bg-info",
	};

	return (
		<span className="flex items-center gap-2">
			<StatusDot color={colorMap[label]} />
			<span>{label}</span>
		</span>
	);
}

export function PaymentMethodSelectContent({ label }: { label: string }) {
	const icon = getPaymentMethodIcon(label);

	return (
		<span className="flex items-center gap-2">
			{icon}
			<span>{label}</span>
		</span>
	);
}

export function ConditionSelectContent({ label }: { label: string }) {
	const icon = getConditionIcon(label);

	return (
		<span className="flex items-center gap-2">
			{icon}
			<span>{label}</span>
		</span>
	);
}

export function AccountCardSelectContent({
	label,
	logo,
	isCartao,
}: SelectItemContentProps & { isCartao?: boolean }) {
	const logoSrc = resolveLogoSrc(logo);
	const Icon = isCartao ? RiBankCard2Line : RiBankLine;

	return (
		<span className="flex items-center gap-2">
			{logoSrc ? (
				<Image
					src={logoSrc}
					alt={`Logo de ${label}`}
					width={20}
					height={20}
					className="rounded-full"
				/>
			) : (
				<Icon className="size-4 text-muted-foreground" aria-hidden />
			)}
			<span>{label}</span>
		</span>
	);
}
