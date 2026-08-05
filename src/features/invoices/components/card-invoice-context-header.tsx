"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { CardImportDefaultsDialog } from "@/features/cards/components/card-import-defaults-dialog";
import type { CardImportPdfPasswordRule } from "@/shared/lib/cards/import-pdf-password";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { cn } from "@/shared/utils/ui";

type CardInvoiceContextHeaderProps = {
	cardId: string;
	cardName: string;
	cardBrand?: string | null;
	logo?: string | null;
	periodLabel: string;
	importPdfPasswordRule: CardImportPdfPasswordRule;
	hasImportPdfPasswordSecret?: boolean;
	actions?: ReactNode;
	embedded?: boolean;
};

export function CardInvoiceContextHeader({
	cardId,
	cardName,
	cardBrand = null,
	logo = null,
	periodLabel,
	importPdfPasswordRule,
	hasImportPdfPasswordSecret = false,
	actions,
	embedded = false,
}: CardInvoiceContextHeaderProps) {
	const logoPath = resolveLogoSrc(logo);

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
							alt={`Logo ${cardName}`}
							width={44}
							height={44}
							className="h-full w-full object-contain"
						/>
					</div>
				) : cardBrand ? (
					<span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-semibold text-primary sm:size-11 sm:text-sm">
						{cardBrand.slice(0, 2).toUpperCase()}
					</span>
				) : null}
				<div className="min-w-0 flex-1">
					<p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						Cartão
					</p>
					<h2 className="truncate text-xl font-semibold leading-tight text-foreground sm:text-2xl">
						{cardName}
					</h2>
					<p className="truncate text-xs text-muted-foreground sm:text-sm">
						Fatura de {periodLabel}
					</p>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-0.5">
				<CardImportDefaultsDialog
					cardId={cardId}
					cardName={cardName}
					importPdfPasswordRule={importPdfPasswordRule}
					hasStoredImportPdfPasswordSecret={hasImportPdfPasswordSecret}
				/>
				{actions}
			</div>
		</header>
	);
}
