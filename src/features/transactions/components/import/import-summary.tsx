import { RiBankCard2Line, RiBankLine, RiCalendarLine } from "@remixicon/react";
import Image from "next/image";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import type { ImportStatement } from "@/shared/lib/import/types";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { formatCurrency } from "@/shared/utils/currency";
import {
	formatDate,
	formatDateOnly,
	formatDateOnlyLabel,
} from "@/shared/utils/date";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type AccountCardSummary = {
	label: string;
	logo?: string | null;
	isCard: boolean;
};

interface ImportSummaryProps {
	statement: ImportStatement;
	invoicePeriod?: string | null;
	accountCard?: AccountCardSummary | null;
	paymentDate?: string | null;
	isPaidInvoiceImport?: boolean;
	total: number;
	selected: number;
	duplicates: number;
	duplicateVerified?: number;
	duplicateMismatch?: number;
	linkSuggestions?: number;
	uncategorized: number;
	withoutPayer: number;
	amountCorrectionCount?: number;
	installmentCorrectionCount?: number;
}

function AccountCardIdentity({ label, logo, isCard }: AccountCardSummary) {
	const logoSrc = resolveLogoSrc(logo);
	const Icon = isCard ? RiBankCard2Line : RiBankLine;

	return (
		<span className="flex min-w-0 items-center gap-2">
			{logoSrc ? (
				<Image
					src={logoSrc}
					alt={`Logo de ${label}`}
					width={24}
					height={24}
					className="size-6 shrink-0 rounded-full"
				/>
			) : (
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background/80">
					<Icon className="size-3.5 text-muted-foreground" aria-hidden />
				</span>
			)}
			<span className="truncate font-medium">{label}</span>
		</span>
	);
}

function ImportSummaryInvoiceHighlight({
	invoicePeriod,
	paymentDate,
	isPaidInvoiceImport,
	className,
}: {
	invoicePeriod: string | null;
	paymentDate: string | null;
	isPaidInvoiceImport: boolean;
	className?: string;
}) {
	if (!invoicePeriod && !(isPaidInvoiceImport && paymentDate)) {
		return null;
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-1 rounded-md border border-primary/25 bg-background/70 px-3 py-2 shadow-xs",
				className,
			)}
		>
			{invoicePeriod ? (
				<p className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
					<RiCalendarLine
						className="size-4 shrink-0 text-primary"
						aria-hidden
					/>
					Fatura {displayPeriod(invoicePeriod)}
				</p>
			) : null}
			{isPaidInvoiceImport && paymentDate ? (
				<p className="text-foreground/90 text-sm">
					{formatDateOnlyLabel(paymentDate, "Data de Pagamento:", {
						day: "2-digit",
						month: "2-digit",
						year: "numeric",
					})}
				</p>
			) : null}
		</div>
	);
}

function ImportSummaryStatementPeriodHighlight({
	period,
	className,
}: {
	period: { from: string; to: string };
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1 rounded-md border border-primary/25 bg-background/70 px-3 py-2 shadow-xs",
				className,
			)}
		>
			<p className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
				<RiCalendarLine className="size-4 shrink-0 text-primary" aria-hidden />
				{formatDateOnly(period.from) ?? "—"} →{" "}
				{formatDateOnly(period.to) ?? "—"}
			</p>
		</div>
	);
}

export function ImportSummary({
	statement,
	invoicePeriod = null,
	accountCard = null,
	paymentDate = null,
	isPaidInvoiceImport = false,
	total,
	selected,
	duplicates,
	duplicateVerified = 0,
	duplicateMismatch = 0,
	linkSuggestions = 0,
	uncategorized,
	withoutPayer,
	amountCorrectionCount = 0,
	installmentCorrectionCount = 0,
}: ImportSummaryProps) {
	const displayName = accountCard?.label ?? statement.source;
	const isCardImport = accountCard?.isCard ?? statement.isCreditCard;
	const showInvoiceHighlight =
		isCardImport &&
		(Boolean(invoicePeriod) || (isPaidInvoiceImport && Boolean(paymentDate)));
	const showStatementPeriodHighlight =
		!isCardImport && Boolean(statement.period);
	const statementBalances = statement.accountBalances;
	const showStatementBalanceHighlight =
		!isCardImport &&
		Boolean(statementBalances?.balances) &&
		statementBalances != null;

	return (
		<Card className="flex flex-col gap-2 p-4 text-sm shadow-none bg-primary/10 sm:gap-1 sm:p-5">
			{/* Mobile: cabeçalho compacto com cartão, fatura e pagamento */}
			<div className="flex flex-col gap-2 md:hidden">
				<div className="flex items-start justify-between gap-2">
					{accountCard ? (
						<AccountCardIdentity {...accountCard} />
					) : (
						<span className="truncate font-medium">{displayName}</span>
					)}
					<div className="flex shrink-0 flex-wrap justify-end gap-1">
						{statement.isCreditCard ? (
							<Badge variant="outline" className="text-xs">
								Cartão
							</Badge>
						) : null}
						{statement.invoice?.isPaid ? (
							<Badge variant="success" className="text-xs">
								Fatura paga
							</Badge>
						) : null}
					</div>
				</div>

				{(showInvoiceHighlight ||
					showStatementPeriodHighlight ||
					showStatementBalanceHighlight) && (
					<>
						{showInvoiceHighlight ? (
							<ImportSummaryInvoiceHighlight
								invoicePeriod={invoicePeriod}
								paymentDate={paymentDate}
								isPaidInvoiceImport={isPaidInvoiceImport}
							/>
						) : null}
						{showStatementPeriodHighlight && statement.period ? (
							<ImportSummaryStatementPeriodHighlight
								period={statement.period}
							/>
						) : null}
						{showStatementBalanceHighlight && statementBalances ? (
							<div className="flex flex-col gap-1 rounded-md border border-primary/25 bg-background/70 px-3 py-2 shadow-xs">
								<p className="font-semibold text-foreground text-sm">
									Saldo do extrato
								</p>
								<p className="text-foreground/90 text-sm tabular-nums">
									{formatCurrency(statementBalances.openingBalance)} →{" "}
									{formatCurrency(statementBalances.closingBalance)}
								</p>
							</div>
						) : null}
					</>
				)}
			</div>

			{/* Desktop: título + badges */}
			<div className="hidden flex-wrap items-center gap-2 md:flex">
				{accountCard ? (
					<AccountCardIdentity {...accountCard} />
				) : (
					<span className="font-medium">{statement.source}</span>
				)}
				{statement.isCreditCard && (
					<Badge variant="outline">Cartão de crédito</Badge>
				)}
				{statement.invoice?.isPaid ? (
					<Badge variant="success">Fatura paga</Badge>
				) : null}
			</div>

			{/* Desktop: fatura ou período do extrato na segunda linha quando aplicável */}
			{(showInvoiceHighlight ||
				showStatementPeriodHighlight ||
				showStatementBalanceHighlight) && (
				<>
					{showInvoiceHighlight ? (
						<ImportSummaryInvoiceHighlight
							className="hidden md:flex md:flex-row md:items-center md:gap-4"
							invoicePeriod={invoicePeriod}
							paymentDate={paymentDate}
							isPaidInvoiceImport={isPaidInvoiceImport}
						/>
					) : null}
					{showStatementPeriodHighlight && statement.period ? (
						<ImportSummaryStatementPeriodHighlight
							className="hidden md:flex md:flex-row md:items-center md:gap-4"
							period={statement.period}
						/>
					) : null}
					{showStatementBalanceHighlight && statementBalances ? (
						<div className="hidden flex-col gap-1 rounded-md border border-primary/25 bg-background/70 px-3 py-2 shadow-xs md:flex md:flex-row md:items-center md:gap-4">
							<p className="font-semibold text-foreground text-sm">
								Saldo do extrato
							</p>
							<p className="text-foreground/90 text-sm tabular-nums">
								{formatCurrency(statementBalances.openingBalance)} →{" "}
								{formatCurrency(statementBalances.closingBalance)}
							</p>
						</div>
					) : null}
				</>
			)}

			{/* Estatísticas da revisão */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs sm:gap-x-4 sm:text-sm">
				{statement.period && isCardImport && (
					<span className="hidden items-center gap-1 lg:flex">
						<RiCalendarLine className="size-3.5 shrink-0" aria-hidden />
						{formatDate(statement.period.from)} →{" "}
						{formatDate(statement.period.to)}
					</span>
				)}

				<span>
					{selected}/{total} selecionadas
				</span>

				{duplicates > 0 && (
					<span className="text-amber-600 dark:text-amber-400">
						{duplicates} já cadastrado{duplicates !== 1 ? "s" : ""}
						{duplicateVerified > 0 || duplicateMismatch > 0
							? ` (${duplicateVerified} conferido${duplicateVerified !== 1 ? "s" : ""}${duplicateMismatch > 0 ? `, ${duplicateMismatch} divergência${duplicateMismatch !== 1 ? "s" : ""}` : ""})`
							: ""}
					</span>
				)}

				{linkSuggestions > 0 && (
					<span className="text-sky-700 dark:text-sky-300">
						{linkSuggestions} possível{linkSuggestions !== 1 ? "is" : ""}{" "}
						vínculo
						{linkSuggestions !== 1 ? "s" : ""}
					</span>
				)}

				{installmentCorrectionCount > 0 && (
					<span className="text-violet-700 dark:text-violet-300">
						{installmentCorrectionCount}{" "}
						{installmentCorrectionCount !== 1
							? "parcelas renumeradas"
							: "parcela renumerada"}
					</span>
				)}

				{amountCorrectionCount > 0 && (
					<span className="text-violet-700 dark:text-violet-300">
						{amountCorrectionCount}{" "}
						{amountCorrectionCount !== 1
							? "valores corrigidos"
							: "valor corrigido"}
					</span>
				)}

				{uncategorized > 0 ? (
					<span>{uncategorized} sem categoria</span>
				) : (
					selected > 0 && (
						<span className="text-emerald-600 dark:text-emerald-400">
							todas categorizadas ✓
						</span>
					)
				)}

				{withoutPayer > 0 ? (
					<span>{withoutPayer} sem pessoa</span>
				) : (
					selected > 0 && (
						<span className="text-emerald-600 dark:text-emerald-400">
							todas com pessoa ✓
						</span>
					)
				)}
			</div>
		</Card>
	);
}
