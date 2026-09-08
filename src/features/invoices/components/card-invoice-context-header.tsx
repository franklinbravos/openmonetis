"use client";

import { RiSettings4Line } from "@remixicon/react";
import Image from "next/image";
import type { ReactNode } from "react";
import { CardDialog } from "@/features/cards/components/card-dialog";
import type { Card } from "@/features/cards/components/types";
import { Button } from "@/shared/components/ui/button";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { cn } from "@/shared/utils/ui";

type AccountOption = {
	id: string;
	name: string;
	logo: string | null;
};

type CardInvoiceContextHeaderProps = {
	card: Card;
	logoOptions: string[];
	accounts: AccountOption[];
	periodLabel: string;
	actions?: ReactNode;
	embedded?: boolean;
};

export function CardInvoiceContextHeader({
	card,
	logoOptions,
	accounts,
	periodLabel,
	actions,
	embedded = false,
}: CardInvoiceContextHeaderProps) {
	const logoPath = resolveLogoSrc(card.logo);

	return (
		<header
			className={cn(
				"flex w-full items-center gap-3",
				embedded ? "min-h-0" : "justify-between",
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				{logoPath ? (
					<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full sm:size-11">
						<Image
							src={logoPath}
							alt={`Logo ${card.name}`}
							width={44}
							height={44}
							className="h-full w-full object-contain"
						/>
					</div>
				) : card.brand ? (
					<span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-semibold text-primary sm:size-11 sm:text-sm">
						{card.brand.slice(0, 2).toUpperCase()}
					</span>
				) : null}
				<div className="min-w-0 flex-1">
					<p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						Cartão
					</p>
					<h2 className="truncate text-xl font-semibold leading-tight text-foreground sm:text-2xl">
						{card.name}
					</h2>
					<p className="truncate text-xs text-muted-foreground sm:text-sm">
						Fatura de {periodLabel}
					</p>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-0.5">
				<CardDialog
					mode="update"
					card={card}
					logoOptions={logoOptions}
					accounts={accounts}
					title="Configurações do cartão"
					description={`Limite, vencimento, conta vinculada e importação de PDF do cartão ${card.name}.`}
					contentClassName="sm:max-w-lg"
					submitLabel="Salvar"
					trigger={
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="text-muted-foreground hover:text-foreground"
							aria-label={`Configurações do cartão ${card.name}`}
						>
							<RiSettings4Line className="size-5" />
						</Button>
					}
				/>
				{actions}
			</div>
		</header>
	);
}
