"use client";

import { RiBankCardLine } from "@remixicon/react";
import Image from "next/image";
import Link from "next/link";
import { formatPeriod } from "@/features/transactions/lib/formatting-helpers";
import type { TransactionItem } from "@/features/transactions/components/types";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { resolveCardBrandLogoSrc } from "@/shared/lib/cards/brand-assets";
import { buildCardInvoiceHref } from "@/shared/lib/invoices/invoice-payment-transaction";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { cn } from "@/shared/utils/ui";

export function hasInvoicePaymentMeta(
	item: Pick<
		TransactionItem,
		"invoicePaymentCardId" | "invoicePaymentPeriod"
	>,
): boolean {
	return Boolean(item.invoicePaymentCardId && item.invoicePaymentPeriod);
}

export function InvoicePaymentMetaLine({
	item,
	className,
	compact = false,
}: {
	item: TransactionItem;
	className?: string;
	compact?: boolean;
}) {
	if (!hasInvoicePaymentMeta(item)) {
		return null;
	}

	const cardName =
		item.invoicePaymentCardName ??
		item.name.replace(/^Pagamento fatura - /i, "").trim();
	const brandLogo = resolveCardBrandLogoSrc(item.invoicePaymentCardBrand);
	const bankLogo = resolveLogoSrc(item.invoicePaymentCardLogo);
	const periodLabel = formatPeriod(item.invoicePaymentPeriod);

	return (
		<span
			className={cn(
				"inline-flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground",
				className,
			)}
		>
			<Badge
				variant="outline"
				className={cn(
					"gap-1 px-1.5 py-0 font-normal",
					compact ? "text-[11px]" : "text-xs",
				)}
			>
				<RiBankCardLine className="size-3 shrink-0" aria-hidden />
				Pgto. fatura
			</Badge>
			{brandLogo ? (
				<Image
					src={brandLogo}
					alt={item.invoicePaymentCardBrand ?? "Bandeira"}
					width={16}
					height={16}
					className="size-4 shrink-0 rounded-full object-contain"
				/>
			) : null}
			{bankLogo ? (
				<Image
					src={bankLogo}
					alt={cardName}
					width={16}
					height={16}
					className="size-4 shrink-0 rounded-full object-cover"
				/>
			) : null}
			<span className="min-w-0 truncate font-medium text-foreground/85">
				{cardName}
			</span>
			<span aria-hidden className="shrink-0">
				·
			</span>
			<span className="min-w-0 truncate">Fatura de {periodLabel}</span>
			{item.invoicePaymentIsAmortization ? (
				<Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
					Amortização
				</Badge>
			) : null}
		</span>
	);
}

export function InvoicePaymentDetailsSection({
	item,
	invoiceTotal,
	isLoadingTotal,
}: {
	item: TransactionItem;
	invoiceTotal?: number | null;
	isLoadingTotal?: boolean;
}) {
	if (!hasInvoicePaymentMeta(item)) {
		return null;
	}

	const cardId = item.invoicePaymentCardId as string;
	const period = item.invoicePaymentPeriod as string;
	const cardName =
		item.invoicePaymentCardName ??
		item.name.replace(/^Pagamento fatura - /i, "").trim();
	const brandLogo = resolveCardBrandLogoSrc(item.invoicePaymentCardBrand);
	const bankLogo = resolveLogoSrc(item.invoicePaymentCardLogo);
	const invoiceHref = buildCardInvoiceHref(cardId, period);

	return (
		<section className="space-y-2">
			<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Pagamento de fatura
			</h3>
			<div className="space-y-3 rounded-lg border bg-muted/20 p-3">
				<div className="flex min-w-0 items-start gap-3">
					<div className="flex shrink-0 items-center gap-1">
						{brandLogo ? (
							<Image
								src={brandLogo}
								alt={item.invoicePaymentCardBrand ?? "Bandeira"}
								width={28}
								height={28}
								className="size-7 rounded-full object-contain"
							/>
						) : null}
						{bankLogo ? (
							<Image
								src={bankLogo}
								alt={cardName}
								width={28}
								height={28}
								className="size-7 rounded-full object-cover"
							/>
						) : null}
					</div>
					<div className="min-w-0 flex-1 space-y-1">
						<p className="text-sm font-medium leading-snug">{cardName}</p>
						<p className="text-sm text-muted-foreground">
							Fatura de {formatPeriod(period)}
						</p>
						{item.invoicePaymentCardBrand ? (
							<p className="text-xs text-muted-foreground">
								Bandeira {item.invoicePaymentCardBrand}
							</p>
						) : null}
						{item.invoicePaymentIsAmortization ? (
							<Badge variant="secondary" className="mt-1">
								Amortização antecipada
							</Badge>
						) : null}
					</div>
				</div>

				{isLoadingTotal ? (
					<p className="text-xs text-muted-foreground">
						Carregando total da fatura...
					</p>
				) : invoiceTotal != null ? (
					<p className="text-sm">
						Total registrado na fatura:{" "}
						<span className="font-semibold">
							{new Intl.NumberFormat("pt-BR", {
								style: "currency",
								currency: "BRL",
							}).format(invoiceTotal)}
						</span>
					</p>
				) : null}

				<p className="text-xs text-muted-foreground">
					Este lançamento quitou (ou amortizou) a fatura do cartão acima. O valor
					saiu da conta{" "}
					{item.contaName ? (
						<span className="font-medium text-foreground">{item.contaName}</span>
					) : (
						"corrente"
					)}
					.
					{item.period &&
					item.invoicePaymentPeriod &&
					item.period !== item.invoicePaymentPeriod ? (
						<>
							{" "}
							O pagamento aparece em{" "}
							<span className="font-medium text-foreground">
								{formatPeriod(item.period)}
							</span>{" "}
							no extrato porque é quando o dinheiro saiu da conta; a fatura
							quitada é de{" "}
							<span className="font-medium text-foreground">
								{formatPeriod(item.invoicePaymentPeriod)}
							</span>
							.
						</>
					) : null}
				</p>

				<Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
					<Link href={invoiceHref}>Ver fatura completa</Link>
				</Button>
			</div>
		</section>
	);
}
