import { RiArrowRightLine } from "@remixicon/react";
import Link from "next/link";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { resolveLogoSrc } from "@/shared/lib/logo";
import type { TransferAccountsPreview } from "@/shared/lib/transfers/utils";
import { cn } from "@/shared/utils/ui";

type TransferAccountsPreviewProps = {
	accounts: TransferAccountsPreview;
	variant?: "compact" | "inline";
	className?: string;
};

function AccountMiniAvatar({
	name,
	logo,
	className,
}: {
	name: string;
	logo: string | null;
	className?: string;
}) {
	return (
		<Avatar className={cn("size-full", className)}>
			{logo ? <AvatarImage src={logo} alt="" className="object-cover" /> : null}
			<AvatarFallback className="bg-muted font-semibold text-[9px] uppercase">
				{name.slice(0, 2)}
			</AvatarFallback>
		</Avatar>
	);
}

function AccountEndpoint({
	name,
	logo,
	href,
	size = "sm",
}: {
	name: string;
	logo: string | null;
	href: string | null;
	size?: "sm" | "md";
}) {
	const avatarSize = size === "md" ? "size-8" : "size-5";
	const content = (
		<>
			<span
				className={cn(
					"inline-flex shrink-0 overflow-hidden rounded-full",
					avatarSize,
				)}
			>
				<AccountMiniAvatar name={name} logo={logo} />
			</span>
			<span className="truncate">{name}</span>
		</>
	);

	if (!href) {
		return (
			<span className="inline-flex min-w-0 items-center gap-2">{content}</span>
		);
	}

	return (
		<Link
			href={href}
			className="group inline-flex min-w-0 items-center gap-2 hover:underline"
		>
			{content}
		</Link>
	);
}

export function TransferAccountsPreviewBadge({
	accounts,
	variant = "inline",
	className,
}: TransferAccountsPreviewProps) {
	const label = `${accounts.from.name} → ${accounts.to.name}`;
	const fromHref = accounts.from.id
		? `/accounts/${accounts.from.id}/statement`
		: null;
	const toHref = accounts.to.id
		? `/accounts/${accounts.to.id}/statement`
		: null;

	if (variant === "compact") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-full border border-info/30 bg-info/5 p-0.5 text-info",
							className,
						)}
					>
						<span className="inline-flex size-5 shrink-0 overflow-hidden rounded-full">
							<AccountMiniAvatar
								name={accounts.from.name}
								logo={resolveLogoSrc(accounts.from.logo)}
							/>
						</span>
						<RiArrowRightLine className="size-3 shrink-0" aria-hidden />
						<span className="inline-flex size-5 shrink-0 overflow-hidden rounded-full">
							<AccountMiniAvatar
								name={accounts.to.name}
								logo={resolveLogoSrc(accounts.to.logo)}
							/>
						</span>
						<span className="sr-only">{label}</span>
					</span>
				</TooltipTrigger>
				<TooltipContent side="top">{label}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"inline-flex min-w-0 max-w-full items-center gap-2 text-info",
						className,
					)}
				>
					<AccountEndpoint
						name={accounts.from.name}
						logo={resolveLogoSrc(accounts.from.logo)}
						href={fromHref}
						size="md"
					/>
					<RiArrowRightLine
						className="size-3.5 shrink-0"
						aria-hidden
					/>
					<AccountEndpoint
						name={accounts.to.name}
						logo={resolveLogoSrc(accounts.to.logo)}
						href={toHref}
						size="md"
					/>
					<span className="sr-only">{label}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}
