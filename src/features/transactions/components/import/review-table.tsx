"use client";

import {
	RiAddLine,
	RiArrowDownSLine,
	RiArrowRightDownLine,
	RiArrowRightUpLine,
	RiBankCardLine,
	RiCheckboxCircleFill,
	RiCloseLine,
	RiExchangeLine,
	RiLinksLine,
	RiMore2Line,
	RiSearchLine,
} from "@remixicon/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CategorySearchSelect } from "@/features/transactions/components/dialogs/transaction-dialog/category-search-select";
import {
	AccountCardSelectContent,
	PayerSelectContent,
	PayerSelectTriggerValue,
} from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import { groupAndSortCategories } from "@/features/transactions/lib/category-helpers";
import type {
	ReviewExistingAmountCorrection,
	ReviewExistingInstallmentCorrection,
} from "@/features/transactions/lib/import-amount-edit";
import { resolveExistingTransactionIdForAmountEdit } from "@/features/transactions/lib/import-amount-edit";
import type { ImportDuplicateValidation } from "@/features/transactions/lib/import-duplicate-match";
import {
	isImportLinkSuggestion,
	isImportRowLinked,
	isImportRowResolved,
	isVerifiedImportDuplicate,
} from "@/features/transactions/lib/import-duplicate-match";
import {
	buildInstallmentImportPreview,
	createManualInstallmentImport,
	createManualRecurrenceImport,
	type ReviewInstallmentImport,
	type ReviewRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import { isInvoiceExtraReviewRow } from "@/features/transactions/lib/import-invoice-extra-rows";
import {
	isImportRowCrossPeriod,
	resolveReviewExistingTransactionId,
} from "@/features/transactions/lib/import-invoice-reconciliation";
import {
	buildImportReviewFilteredEntries,
	countImportReviewRowsByStatus,
	hasActiveImportReviewFilters,
	IMPORT_REVIEW_STATUS_FILTER_OPTIONS,
	type ImportReviewStatusFilter,
	isImportReviewRowImportable,
} from "@/features/transactions/lib/import-review-filters";
import MoneyValues from "@/shared/components/money-values";
import { PeriodPicker } from "@/shared/components/period-picker";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { SelectCreateAction } from "@/shared/components/ui/select-create-action";
import { Switch } from "@/shared/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { normalizeImportedText } from "@/shared/lib/import/helpers";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { getConditionIcon } from "@/shared/utils/icons";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

function getInvoiceExtraRowClassName(row: ReviewRow) {
	if (!isInvoiceExtraReviewRow(row)) return "";
	return row.selected
		? "border-destructive/40 bg-destructive/5"
		: "border-amber-500/40 bg-amber-500/5";
}

function getDuplicateRowClassName(row: ReviewRow) {
	if (isInvoiceExtraReviewRow(row)) {
		return getInvoiceExtraRowClassName(row);
	}

	if (isVerifiedImportDuplicate(row) || isImportRowLinked(row)) {
		return "border-emerald-500/40 bg-emerald-500/8";
	}

	if (isImportLinkSuggestion(row)) {
		return "border-sky-500/40 bg-sky-500/5";
	}

	if (!row.isDuplicate || row.selected) return "";

	if (row.duplicateValidation?.status === "match") {
		return "border-emerald-500/30 bg-emerald-500/5";
	}

	if (row.duplicateValidation?.status === "mismatch") {
		return "border-amber-500/40 bg-amber-500/5";
	}

	return "opacity-50";
}

function isReviewRowClassified(row: ReviewRow): boolean {
	if (
		isVerifiedImportDuplicate(row) ||
		isImportRowLinked(row) ||
		isInvoiceExtraReviewRow(row)
	) {
		return false;
	}

	if (row.kind === "invoice_payment") {
		return Boolean(row.invoicePaymentCardId && row.invoicePaymentPeriod);
	}

	if (row.kind === "transfer") {
		return Boolean(row.transferPeerAccountId);
	}

	return Boolean(row.categoryId);
}

function getReviewRowClassifiedClassName(row: ReviewRow): string {
	if (!isReviewRowClassified(row)) return "";
	return "border-emerald-500/40 bg-emerald-500/8 hover:bg-emerald-500/10";
}

function ReviewVerifiedDuplicateDescription({
	row,
	index,
	cardOptions,
	onEditDuplicate,
	onUndoDuplicate,
}: {
	row: ReviewRow;
	index: number;
	cardOptions: SelectOption[];
	onEditDuplicate: (index: number) => void;
	onUndoDuplicate: (index: number) => void;
}) {
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5">
			<p className="min-w-0 flex-1 truncate font-medium">{row.description}</p>
			<ReviewVerifiedInvoicePaymentBadge row={row} cardOptions={cardOptions} />
			<Badge variant="success" className="shrink-0 text-[10px]">
				Conferido
			</Badge>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-7 shrink-0 px-2 text-xs"
				onClick={() => onEditDuplicate(index)}
			>
				Editar
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						aria-label="Mais opções"
					>
						<RiMore2Line className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => onUndoDuplicate(index)}>
						Reimportar mesmo assim
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function ReviewVerifiedExistingValue({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-8 min-w-0 items-center rounded-md border border-input/60 bg-muted/35 px-2 text-xs",
				className,
			)}
		>
			{children}
		</div>
	);
}

function ReviewVerifiedExistingPayer({
	payerId,
	payerOptions,
	fullWidth = false,
	compact = false,
}: {
	payerId: string | null;
	payerOptions: SelectOption[];
	fullWidth?: boolean;
	compact?: boolean;
}) {
	const payerOption = payerOptions.find((option) => option.value === payerId);

	if (!payerOption) {
		return (
			<ReviewVerifiedExistingValue
				className={cn(
					"text-muted-foreground",
					fullWidth && "w-full",
					(compact || !fullWidth) && "size-8 shrink-0 justify-center px-0",
				)}
			>
				{compact || !fullWidth ? "—" : "Sem pessoa"}
			</ReviewVerifiedExistingValue>
		);
	}

	const content = (
		<ReviewVerifiedExistingValue
			className={cn(
				"gap-2",
				fullWidth && "w-full",
				compact || !fullWidth
					? "size-8 shrink-0 justify-center px-0"
					: undefined,
			)}
		>
			<PayerSelectTriggerValue
				label={payerOption.label}
				avatarUrl={payerOption.avatarUrl}
				showLabel={fullWidth}
			/>
		</ReviewVerifiedExistingValue>
	);

	if (compact || !fullWidth) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{content}</TooltipTrigger>
				<TooltipContent>{payerOption.label}</TooltipContent>
			</Tooltip>
		);
	}

	return content;
}

function ReviewVerifiedExistingCategory({
	categoryId,
	categoryOptions,
	fullWidth = false,
	compact = false,
}: {
	categoryId: string | null;
	categoryOptions: SelectOption[];
	fullWidth?: boolean;
	compact?: boolean;
}) {
	const categoryOption = categoryOptions.find(
		(option) => option.value === categoryId,
	);

	return (
		<ReviewVerifiedExistingValue
			className={cn(
				"truncate",
				fullWidth && "w-full",
				compact && "min-w-0 flex-1",
			)}
		>
			{categoryOption ? (
				<span className="truncate">{categoryOption.label}</span>
			) : (
				<span className="text-muted-foreground">Sem categoria</span>
			)}
		</ReviewVerifiedExistingValue>
	);
}

function getReviewRowKindLabel(row: ReviewRow): string {
	if (row.kind === "invoice_payment") return "Pgto. fatura";
	if (row.kind === "transfer") return "Transferência";
	return row.transactionType === "income" ? "Receita" : "Despesa";
}

function getReviewRowKindIcon(row: ReviewRow) {
	if (row.kind === "invoice_payment") {
		return <RiBankCardLine className="size-3.5" aria-hidden />;
	}

	if (row.kind === "transfer") {
		return <RiExchangeLine className="size-3.5" aria-hidden />;
	}

	if (row.transactionType === "income") {
		return <RiArrowRightDownLine className="size-3.5" aria-hidden />;
	}

	return <RiArrowRightUpLine className="size-3.5" aria-hidden />;
}

function getReviewRowKindIconClassName(row: ReviewRow): string {
	if (row.kind === "invoice_payment") {
		return "border-primary/30 bg-primary/5 text-primary";
	}

	if (row.kind === "transfer") {
		return "border-info/30 bg-info/5 text-info";
	}

	if (row.transactionType === "income") {
		return "border-success/30 bg-success/5 text-success";
	}

	return "border-destructive/30 bg-destructive/5 text-destructive";
}

type ReviewKindSelectValue =
	| "expense"
	| "income"
	| "invoice_payment"
	| "transfer";

function getReviewKindSelectRow(
	value: ReviewKindSelectValue,
): Pick<ReviewRow, "kind" | "transactionType"> {
	if (value === "invoice_payment") {
		return { kind: "invoice_payment", transactionType: "expense" };
	}

	if (value === "transfer") {
		return { kind: "transfer", transactionType: "expense" };
	}

	return {
		kind: "transaction",
		transactionType: value,
	};
}

function ReviewRowKindOptionIcon({ value }: { value: ReviewKindSelectValue }) {
	const pseudoRow = getReviewKindSelectRow(value) as ReviewRow;

	return (
		<span
			className={cn(
				"inline-flex size-5 shrink-0 items-center justify-center rounded-md border",
				getReviewRowKindIconClassName(pseudoRow),
			)}
		>
			{getReviewRowKindIcon(pseudoRow)}
		</span>
	);
}

function ReviewVerifiedExistingType({
	transactionType,
	rowKind = "transaction",
	fullWidth = false,
	compact = false,
}: {
	transactionType: ReviewRow["transactionType"];
	rowKind?: ReviewRow["kind"];
	fullWidth?: boolean;
	compact?: boolean;
}) {
	const row = {
		kind: rowKind,
		transactionType,
	} as Pick<ReviewRow, "kind" | "transactionType">;

	if (compact) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={cn(
							"inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
							getReviewRowKindIconClassName(row as ReviewRow),
						)}
					>
						{getReviewRowKindIcon(row as ReviewRow)}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{getReviewRowKindLabel(row as ReviewRow)}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<ReviewVerifiedExistingValue className={fullWidth ? "w-full" : undefined}>
			{/*
			 * Pagamento de fatura e transferência não são "Despesa": o dinheiro sai
			 * da conta, mas liquida uma fatura ou muda de bolso. Mostrar o tipo bruto
			 * fazia a linha parecer uma despesa comum já conferida.
			 */}
			{getReviewRowKindLabel(row as ReviewRow)}
		</ReviewVerifiedExistingValue>
	);
}

/**
 * Diz, na linha conferida, que ela é pagamento de fatura — e de qual fatura.
 *
 * Numa linha conferida nada é gravado: o que vale é o vínculo que o cadastro já
 * tem, lido da anotação `AUTO_FATURA`. Sem cartão e mês visíveis, "Conferido"
 * escondia dois casos bem diferentes — o pagamento certo, e um lançamento que
 * entrou como despesa comum e não abate fatura nenhuma.
 */
function ReviewVerifiedInvoicePaymentBadge({
	row,
	cardOptions,
}: {
	row: ReviewRow;
	cardOptions: SelectOption[];
}) {
	if (row.kind !== "invoice_payment") return null;

	const labelFor = (cardId: string | null, period: string | null) => {
		const cardLabel = cardId
			? (cardOptions.find((option) => option.value === cardId)?.label ?? null)
			: null;
		if (!cardLabel || !period) return null;
		return `${cardLabel} · ${displayPeriod(period)}`;
	};

	// Cartão e mês vêm em par: o cartão registrado com o mês adivinhado seria uma
	// fatura que não existe.
	const registered = labelFor(
		row.duplicateValidation?.existingInvoiceCardId ?? null,
		row.duplicateValidation?.existingInvoicePeriod ?? null,
	);

	if (registered) {
		return (
			<Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
				<RiBankCardLine className="size-3" aria-hidden />
				{`Fatura ${registered}`}
			</Badge>
		);
	}

	// O cadastro casado não aponta fatura nenhuma: é uma despesa comum.
	const guessed = labelFor(row.invoicePaymentCardId, row.invoicePaymentPeriod);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge
					variant="outline"
					className="shrink-0 gap-1 border-amber-500/40 bg-amber-500/5 text-[10px] text-amber-800 dark:text-amber-300"
				>
					<RiBankCardLine className="size-3" aria-hidden />
					Fatura — cadastro sem vínculo
				</Badge>
			</TooltipTrigger>
			<TooltipContent className="max-w-72">
				O arquivo diz que esta linha é pagamento de fatura, mas o lançamento já
				cadastrado está como despesa comum, sem vínculo com nenhuma fatura.
				{guessed
					? ` Pelo valor e pela data, ela liquida a fatura ${guessed}.`
					: ""}
			</TooltipContent>
		</Tooltip>
	);
}

function ReviewDuplicateStatus({
	row,
	index,
	onUndoDuplicate,
}: {
	row: ReviewRow;
	index: number;
	onUndoDuplicate: (index: number) => void;
}) {
	if (!row.isDuplicate) return null;

	const validation = row.duplicateValidation;
	const isVerified = validation?.status === "match";
	const hasMismatch = validation?.status === "mismatch";

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<Badge
					variant={
						isVerified ? "success" : hasMismatch ? "destructive" : "secondary"
					}
					className="text-[10px]"
				>
					{isVerified
						? "Já cadastrado · conferido"
						: hasMismatch
							? "Já cadastrado · divergência"
							: "Já cadastrado"}
				</Badge>
				<button
					type="button"
					onClick={() => onUndoDuplicate(index)}
					className="text-primary text-xs underline-offset-2 hover:underline"
				>
					reimportar
				</button>
			</div>

			{isVerified ? (
				<p className="text-emerald-700 text-xs dark:text-emerald-400">
					{row.aiSuggestion?.duplicate
						? "Identificado pela IA como lançamento já cadastrado."
						: "Os dados do extrato batem com o lançamento existente."}
				</p>
			) : null}

			{hasMismatch && validation ? (
				<div className="min-w-0 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
					<p className="font-medium text-amber-800 dark:text-amber-300">
						Diferenças encontradas:
					</p>
					<ReviewMatchedExistingSummary validation={validation} />
					<ul className="mt-1 space-y-1 break-words text-amber-900/90 whitespace-normal dark:text-amber-100/90">
						{validation.mismatches.map((mismatch) => (
							<li key={mismatch.field} className="break-words">
								<span className="font-medium">{mismatch.label}:</span> extrato{" "}
								{mismatch.imported} · cadastro {mismatch.existing}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}

/** Diz com qual cadastro a linha casou: sem isso a divergência parece vir de outro mês. */
function ReviewMatchedExistingSummary({
	validation,
}: {
	validation: ImportDuplicateValidation;
}) {
	const partes = [
		validation.existingName,
		validation.existingInstallmentLabel
			? `parcela ${validation.existingInstallmentLabel}`
			: null,
		validation.existingPeriod
			? `fatura de ${displayPeriod(validation.existingPeriod)}`
			: null,
	].filter(Boolean);

	if (partes.length === 0) return null;

	return (
		<p className="mt-1 break-words text-amber-900/70 whitespace-normal dark:text-amber-100/70">
			Casou com: {partes.join(" · ")}
		</p>
	);
}

function ReviewLinkSuggestionStatus({
	row,
	index,
	categoryOptions,
	onLinkDuplicate,
	onDismissLinkSuggestion,
}: {
	row: ReviewRow;
	index: number;
	categoryOptions: SelectOption[];
	onLinkDuplicate: (index: number) => void;
	onDismissLinkSuggestion: (index: number) => void;
}) {
	if (!isImportLinkSuggestion(row) || !row.duplicateValidation) return null;

	const validation = row.duplicateValidation;
	const matchedFields = [
		validation.matchScore.date ? "data" : null,
		validation.matchScore.amount ? "valor" : null,
		validation.matchScore.description ? "descrição" : null,
	].filter((field): field is string => field !== null);
	const existingCategoryLabel = categoryOptions.find(
		(option) => option.value === validation.existingCategoryId,
	)?.label;

	return (
		<div className="min-w-0 space-y-2">
			<Badge
				variant="outline"
				className="w-fit border-sky-500/40 text-[10px] text-sky-700 dark:text-sky-300"
			>
				Possível vínculo
			</Badge>
			<p className="break-words text-sky-800 text-xs whitespace-normal dark:text-sky-300">
				{matchedFields.length > 0
					? `${matchedFields.join(" e ")} batem com um lançamento existente.`
					: "Dois campos batem com um lançamento existente."}
			</p>
			{validation.existingCategoryId ? (
				existingCategoryLabel && !row.categoryId ? (
					<p className="text-muted-foreground text-xs">
						Categoria no cadastro:{" "}
						<span className="font-medium text-foreground">
							{existingCategoryLabel}
						</span>
					</p>
				) : null
			) : (
				<p className="text-muted-foreground text-xs">
					O lançamento existente não tem categoria no cadastro.
				</p>
			)}
			<div className="flex flex-wrap gap-1.5">
				<Button
					type="button"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					onClick={() => onLinkDuplicate(index)}
				>
					<RiLinksLine className="size-3.5 shrink-0" aria-hidden />
					Vincular
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					onClick={() => onDismissLinkSuggestion(index)}
				>
					<RiAddLine className="size-3.5 shrink-0" aria-hidden />
					Importar novo
				</Button>
			</div>
		</div>
	);
}

function ReviewLinkedStatus({ row }: { row: ReviewRow }) {
	if (!isImportRowLinked(row)) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Badge variant="success" className="text-[10px]">
				Vinculado ao cadastro
			</Badge>
			<p className="text-emerald-700 text-xs dark:text-emerald-400">
				As informações foram unidas ao lançamento existente.
			</p>
		</div>
	);
}

function ReviewCrossPeriodStatus({
	row,
	index,
	invoicePeriodExistingIdSet,
	periodLockedExistingIds,
	onMoveToInvoicePeriod,
}: {
	row: ReviewRow;
	index: number;
	invoicePeriodExistingIdSet?: Set<string>;
	periodLockedExistingIds?: Set<string>;
	onMoveToInvoicePeriod: (index: number) => void;
}) {
	if (!invoicePeriodExistingIdSet) return null;
	if (!isImportRowCrossPeriod(row, invoicePeriodExistingIdSet)) return null;

	const existingTransactionId = resolveReviewExistingTransactionId(row);
	const isPeriodLocked = Boolean(
		existingTransactionId &&
			periodLockedExistingIds?.has(existingTransactionId),
	);

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap items-center gap-1.5">
				<Badge variant="secondary" className="text-[10px]">
					Outro período
				</Badge>
				<p className="text-muted-foreground text-xs leading-relaxed">
					O lançamento existente está cadastrado em outro período e não conta
					para o total desta fatura.
				</p>
			</div>
			{isPeriodLocked ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					É uma parcela ou lançamento recorrente: cada ocorrência pertence ao
					mês em que cai. Se o período estiver errado, corrija na tela de
					lançamentos.
				</p>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					onClick={() => onMoveToInvoicePeriod(index)}
				>
					<RiArrowRightUpLine className="size-3.5 shrink-0" aria-hidden />
					Mover para esta fatura
				</Button>
			)}
		</div>
	);
}

function ReviewInvoiceExtraStatus({ row }: { row: ReviewRow }) {
	if (!isInvoiceExtraReviewRow(row)) return null;

	const isDuplicateExtra = row.invoiceExtraReason === "duplicate";
	const badgeLabel = row.selected
		? isDuplicateExtra
			? "Duplicata — será removida"
			: "Será removido"
		: isDuplicateExtra
			? "Duplicata no cadastro"
			: "Fora do arquivo";

	const message = row.selected
		? isDuplicateExtra
			? "Este lançamento está duplicado no cadastro em relação ao arquivo e será excluído ao confirmar a importação."
			: "Este lançamento cadastrado não aparece no arquivo e será excluído ao confirmar a importação."
		: isDuplicateExtra
			? "Duplicata do item do arquivo. Marque para excluir a cópia extra ao confirmar."
			: "Este lançamento cadastrado não aparece no arquivo. Marque para excluí-lo ao confirmar.";

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<Badge
				variant={row.selected ? "destructive" : "outline"}
				className="text-[10px]"
			>
				{badgeLabel}
			</Badge>
			<p
				className={cn(
					"text-xs leading-relaxed",
					row.selected ? "text-destructive" : "text-muted-foreground",
				)}
			>
				{message}
			</p>
		</div>
	);
}

const categoryGroupByTransactionType: Record<
	ImportedTransaction["transactionType"],
	string
> = {
	expense: "despesa",
	income: "receita",
};

export type ReviewRowKind =
	| "transaction"
	| "invoice_payment"
	| "transfer"
	| "invoice_extra";

export type ReviewRow = ImportedTransaction & {
	/** Identidade estável para React keys; externalId pode repetir no mesmo extrato. */
	reviewKey: string;
	selected: boolean;
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
	categoryId: string | null;
	payerId: string | null;
	kind: ReviewRowKind;
	/** Lançamento já cadastrado na fatura, ausente do arquivo importado. */
	existingTransactionId?: string | null;
	invoiceExtraReason?: "duplicate" | "not_in_file" | null;
	invoicePaymentCardId: string | null;
	invoicePaymentPeriod: string | null;
	transferPeerAccountId: string | null;
	installmentImport: ReviewInstallmentImport | null;
	recurrenceImport: ReviewRecurrenceImport | null;
	reimported?: boolean;
	linked?: boolean;
	linkedTransactionId?: string | null;
	/** Valor cadastrado do período reconciliado, quando o lançamento existe. */
	existingAmount?: number | null;
	/** Correção de valor do lançamento existente, aplicada na confirmação. */
	existingAmountCorrection?: ReviewExistingAmountCorrection | null;
	/** Correção da parcela (N/M) do lançamento existente, aplicada na confirmação. */
	existingInstallmentCorrection?: ReviewExistingInstallmentCorrection | null;
	/** Chave estável do rascunho, capturada antes de qualquer edição. */
	originalDraftKey?: string;
	/** Nome exatamente como veio do extrato/fatura; não muda ao editar na revisão. */
	sourceDescription: string;
	aiSuggestion?: {
		duplicate?: boolean;
		category?: boolean;
		note?: string;
		confidence?: number;
	} | null;
};

function resolveReviewExistingPayerId(
	row: ReviewRow,
	defaultPayerId: string | null,
): string | null {
	return (
		row.duplicateValidation?.existingPayerId ?? row.payerId ?? defaultPayerId
	);
}

function getReviewRowKey(row: ReviewRow) {
	return row.reviewKey;
}

interface ReviewTableProps {
	rows: ReviewRow[];
	defaultPayerId: string | null;
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	cardOptions: SelectOption[];
	transferAccountOptions: SelectOption[];
	isCard: boolean;
	invoicePeriod: string | null;
	invoicePeriodExistingIdSet?: Set<string>;
	periodLockedExistingIds?: Set<string>;
	onToggle: (index: number) => void;
	onToggleAll: (selected: boolean) => void;
	onToggleAllFiltered: (indices: number[], selected: boolean) => void;
	onPayerChange: (index: number, payerId: string | null) => void;
	onCategoryChange: (index: number, categoryId: string | null) => void;
	onCreateCategory: (index: number) => void;
	onRowTypeChange: (
		index: number,
		type: "expense" | "income" | "invoice_payment" | "transfer",
	) => void;
	onInvoicePaymentCardChange: (index: number, cardId: string | null) => void;
	onInvoicePaymentPeriodChange: (index: number, period: string | null) => void;
	onTransferPeerAccountChange: (
		index: number,
		accountId: string | null,
	) => void;
	onCreateTransferPeerAccount: (index: number) => void;
	onDescriptionChange: (index: number, description: string) => void;
	onInstallmentToggle: (index: number, enabled: boolean) => void;
	onInstallmentDismiss: (index: number) => void;
	onInstallmentCountChange: (index: number, installmentCount: number) => void;
	onInstallmentCurrentChange: (
		index: number,
		currentInstallment: number,
	) => void;
	onUndoDuplicate: (index: number) => void;
	onEditDuplicate: (index: number) => void;
	onLinkDuplicate: (index: number) => void;
	onDismissLinkSuggestion: (index: number) => void;
	onConvertToInstallment: (index: number) => void;
	onConvertToRecurrence: (index: number) => void;
	onRecurrenceToggle: (index: number, enabled: boolean) => void;
	onRecurrenceCountChange: (index: number, recurrenceCount: number) => void;
	onAmountChange: (index: number, amount: number) => void;
	onMoveToInvoicePeriod: (index: number) => void;
}

export function ReviewTable({
	rows,
	defaultPayerId,
	payerOptions,
	categoryOptions,
	cardOptions,
	transferAccountOptions,
	isCard,
	invoicePeriod,
	invoicePeriodExistingIdSet,
	periodLockedExistingIds,
	onToggle,
	onToggleAll,
	onToggleAllFiltered,
	onPayerChange,
	onCategoryChange,
	onCreateCategory,
	onRowTypeChange,
	onInvoicePaymentCardChange,
	onInvoicePaymentPeriodChange,
	onTransferPeerAccountChange,
	onCreateTransferPeerAccount,
	onDescriptionChange,
	onInstallmentToggle,
	onInstallmentDismiss,
	onInstallmentCountChange,
	onInstallmentCurrentChange,
	onUndoDuplicate,
	onEditDuplicate,
	onLinkDuplicate,
	onDismissLinkSuggestion,
	onConvertToInstallment,
	onConvertToRecurrence,
	onRecurrenceToggle,
	onRecurrenceCountChange,
	onAmountChange,
	onMoveToInvoicePeriod,
}: ReviewTableProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] =
		useState<ImportReviewStatusFilter>("all");

	const filteredEntries = useMemo(
		() => buildImportReviewFilteredEntries(rows, searchQuery, statusFilter),
		[rows, searchQuery, statusFilter],
	);
	const statusCounts = useMemo(
		() => countImportReviewRowsByStatus(rows),
		[rows],
	);
	const filtersActive = hasActiveImportReviewFilters(searchQuery, statusFilter);
	const importableFilteredEntries = filteredEntries.filter(({ row }) =>
		isImportReviewRowImportable(row),
	);
	const allSelected =
		importableFilteredEntries.length > 0 &&
		importableFilteredEntries.every(({ row }) => row.selected);
	const someSelected = importableFilteredEntries.some(
		({ row }) => row.selected,
	);

	const handleToggleAll = (selected: boolean) => {
		if (filtersActive) {
			onToggleAllFiltered(
				importableFilteredEntries.map(({ index }) => index),
				selected,
			);
			return;
		}

		onToggleAll(selected);
	};

	return (
		<TooltipProvider>
			<div className="rounded-lg border">
				<ReviewImportFilters
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					statusFilter={statusFilter}
					onStatusFilterChange={setStatusFilter}
					filteredCount={filteredEntries.length}
					totalCount={rows.length}
					statusCounts={statusCounts}
				/>

				{filteredEntries.length === 0 ? (
					<div className="px-4 py-10 text-center text-muted-foreground text-sm">
						Nenhum lançamento corresponde aos filtros atuais.
					</div>
				) : (
					<>
						<ReviewMobileList
							entries={filteredEntries}
							defaultPayerId={defaultPayerId}
							allSelected={allSelected}
							someSelected={someSelected}
							payerOptions={payerOptions}
							categoryOptions={categoryOptions}
							cardOptions={cardOptions}
							transferAccountOptions={transferAccountOptions}
							isCard={isCard}
							invoicePeriod={invoicePeriod}
							invoicePeriodExistingIdSet={invoicePeriodExistingIdSet}
							periodLockedExistingIds={periodLockedExistingIds}
							onMoveToInvoicePeriod={onMoveToInvoicePeriod}
							onToggle={onToggle}
							onToggleAll={handleToggleAll}
							filtersActive={filtersActive}
							visibleImportableCount={importableFilteredEntries.length}
							onPayerChange={onPayerChange}
							onCategoryChange={onCategoryChange}
							onCreateCategory={onCreateCategory}
							onRowTypeChange={onRowTypeChange}
							onInvoicePaymentCardChange={onInvoicePaymentCardChange}
							onInvoicePaymentPeriodChange={onInvoicePaymentPeriodChange}
							onTransferPeerAccountChange={onTransferPeerAccountChange}
							onCreateTransferPeerAccount={onCreateTransferPeerAccount}
							onDescriptionChange={onDescriptionChange}
							onInstallmentToggle={onInstallmentToggle}
							onInstallmentDismiss={onInstallmentDismiss}
							onInstallmentCountChange={onInstallmentCountChange}
							onInstallmentCurrentChange={onInstallmentCurrentChange}
							onUndoDuplicate={onUndoDuplicate}
							onEditDuplicate={onEditDuplicate}
							onLinkDuplicate={onLinkDuplicate}
							onDismissLinkSuggestion={onDismissLinkSuggestion}
							onConvertToInstallment={onConvertToInstallment}
							onConvertToRecurrence={onConvertToRecurrence}
							onRecurrenceToggle={onRecurrenceToggle}
							onRecurrenceCountChange={onRecurrenceCountChange}
							onAmountChange={onAmountChange}
						/>

						<Table className="hidden md:table">
							<TableHeader className="sticky top-0 z-10 bg-background">
								<TableRow>
									<TableHead className="w-10">
										<Checkbox
											checked={allSelected}
											onCheckedChange={(v) => handleToggleAll(!!v)}
											aria-label={
												filtersActive
													? "Selecionar lançamentos visíveis"
													: "Selecionar todas"
											}
											data-state={
												!allSelected && someSelected
													? "indeterminate"
													: undefined
											}
										/>
									</TableHead>
									<TableHead className="w-24">Data</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-12 text-center">Pessoa</TableHead>
									<TableHead className="w-44">Categoria / Fatura</TableHead>
									<TableHead className="w-32">Tipo</TableHead>
									<TableHead className="w-28 text-right">Valor</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredEntries.map(({ row, index }) => {
									const categoryOptionsForRow = categoryOptions.filter(
										(option) =>
											option.group ===
											categoryGroupByTransactionType[row.transactionType],
									);

									if (isInvoiceExtraReviewRow(row)) {
										return (
											<TableRow
												key={getReviewRowKey(row)}
												className={getInvoiceExtraRowClassName(row)}
											>
												<TableCell>
													<Checkbox
														checked={row.selected}
														onCheckedChange={() => onToggle(index)}
														aria-label={`Marcar remoção de ${row.description}`}
														tabIndex={-1}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground text-sm">
													{formatDate(row.date)}
												</TableCell>
												<TableCell className="min-w-[18rem] whitespace-normal text-sm">
													<div className="space-y-1">
														<p className="font-medium">{row.description}</p>
														<ReviewInvoiceExtraStatus row={row} />
													</div>
												</TableCell>
												<TableCell className="w-12 text-center">
													<div className="flex justify-center">
														<ReviewVerifiedExistingPayer
															payerId={row.payerId}
															payerOptions={payerOptions}
														/>
													</div>
												</TableCell>
												<TableCell>
													<ReviewVerifiedExistingCategory
														categoryId={row.categoryId}
														categoryOptions={categoryOptions}
													/>
												</TableCell>
												<TableCell>
													<ReviewVerifiedExistingType
														transactionType={row.transactionType}
														rowKind={row.kind}
													/>
												</TableCell>
												<TableCell className="text-right text-sm">
													<ReviewAmountField
														row={row}
														index={index}
														onAmountChange={onAmountChange}
														alignRight
													/>
												</TableCell>
											</TableRow>
										);
									}

									if (
										isVerifiedImportDuplicate(row) ||
										isImportRowLinked(row)
									) {
										const existingPayerId = resolveReviewExistingPayerId(
											row,
											defaultPayerId,
										);
										const existingCategoryId =
											row.duplicateValidation?.existingCategoryId ?? null;

										return (
											<TableRow
												key={getReviewRowKey(row)}
												className={getDuplicateRowClassName(row)}
											>
												<TableCell className="w-10">
													<RiCheckboxCircleFill
														className="size-5 text-emerald-600 dark:text-emerald-400"
														aria-label={
															isImportRowLinked(row)
																? "Lançamento vinculado"
																: "Lançamento conferido"
														}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground text-sm">
													{formatDate(row.date)}
												</TableCell>
												<TableCell className="min-w-[18rem] whitespace-normal text-sm">
													{isImportRowLinked(row) ? (
														<div className="space-y-1">
															<p className="font-medium">{row.description}</p>
															<ReviewLinkedStatus row={row} />
														</div>
													) : (
														<ReviewVerifiedDuplicateDescription
															row={row}
															index={index}
															cardOptions={cardOptions}
															onEditDuplicate={onEditDuplicate}
															onUndoDuplicate={onUndoDuplicate}
														/>
													)}
													<ReviewCrossPeriodStatus
														row={row}
														index={index}
														invoicePeriodExistingIdSet={
															invoicePeriodExistingIdSet
														}
														periodLockedExistingIds={periodLockedExistingIds}
														onMoveToInvoicePeriod={onMoveToInvoicePeriod}
													/>
												</TableCell>
												<TableCell className="w-12 text-center">
													<div className="flex justify-center">
														<ReviewVerifiedExistingPayer
															payerId={existingPayerId}
															payerOptions={payerOptions}
														/>
													</div>
												</TableCell>
												<TableCell>
													<ReviewVerifiedExistingCategory
														categoryId={existingCategoryId}
														categoryOptions={categoryOptions}
													/>
												</TableCell>
												<TableCell>
													<ReviewVerifiedExistingType
														transactionType={row.transactionType}
														rowKind={row.kind}
													/>
												</TableCell>
												<TableCell className="text-right text-sm">
													<ReviewAmountField
														row={row}
														index={index}
														onAmountChange={onAmountChange}
														alignRight
													/>
												</TableCell>
											</TableRow>
										);
									}

									return (
										<TableRow
											key={getReviewRowKey(row)}
											className={cn(
												getDuplicateRowClassName(row),
												getReviewRowClassifiedClassName(row),
											)}
										>
											<TableCell>
												<Checkbox
													checked={row.selected}
													onCheckedChange={() => onToggle(index)}
													disabled={isImportLinkSuggestion(row)}
													aria-label={`Selecionar ${row.description}`}
													tabIndex={-1}
												/>
											</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{formatDate(row.date)}
											</TableCell>
											{/*
											 * A descrição é o que distingue uma linha da outra, então é
											 * ela que precisa de espaço — não os selects. Antes a célula
											 * era travada em 200px e o campo era um input de uma linha:
											 * "Transferência recebida pelo Pix FULANO - CNPJ - BANCO"
											 * aparecia como "Transferência", igual em toda linha.
											 */}
											<TableCell className="min-w-[18rem] whitespace-normal text-sm">
												<div className="min-w-0 space-y-2">
													<ReviewDescriptionField
														row={row}
														index={index}
														fullWidth
														isCard={isCard}
														invoicePeriod={invoicePeriod}
														categoryOptions={categoryOptions}
														onDescriptionChange={onDescriptionChange}
														onUndoDuplicate={onUndoDuplicate}
														onLinkDuplicate={onLinkDuplicate}
														onDismissLinkSuggestion={onDismissLinkSuggestion}
														onConvertToInstallment={onConvertToInstallment}
														onConvertToRecurrence={onConvertToRecurrence}
														excludeFromTabOrder
													/>
													<ReviewInstallmentFields
														row={row}
														index={index}
														isCard={isCard}
														invoicePeriod={invoicePeriod}
														onInstallmentToggle={onInstallmentToggle}
														onInstallmentDismiss={onInstallmentDismiss}
														onInstallmentCountChange={onInstallmentCountChange}
														onInstallmentCurrentChange={
															onInstallmentCurrentChange
														}
													/>
													<ReviewRecurrenceFields
														row={row}
														index={index}
														onRecurrenceToggle={onRecurrenceToggle}
														onRecurrenceCountChange={onRecurrenceCountChange}
													/>
												</div>
											</TableCell>
											<TableCell className="w-12 text-center">
												<div className="flex justify-center">
													<ReviewPayerSelect
														row={row}
														index={index}
														payerOptions={payerOptions}
														onPayerChange={onPayerChange}
														skipPeerTabStops
													/>
												</div>
											</TableCell>
											<TableCell className="w-44 max-w-[11rem]">
												{row.kind === "invoice_payment" ? (
													<ReviewInvoicePaymentFields
														row={row}
														index={index}
														cardOptions={cardOptions}
														onInvoicePaymentCardChange={
															onInvoicePaymentCardChange
														}
														onInvoicePaymentPeriodChange={
															onInvoicePaymentPeriodChange
														}
														skipPeerTabStops
													/>
												) : row.kind === "transfer" ? (
													<ReviewTransferFields
														row={row}
														index={index}
														accountOptions={transferAccountOptions}
														onTransferPeerAccountChange={
															onTransferPeerAccountChange
														}
														onCreateTransferPeerAccount={
															onCreateTransferPeerAccount
														}
														skipPeerTabStops
													/>
												) : (
													<ReviewCategorySelect
														row={row}
														index={index}
														categoryOptions={categoryOptionsForRow}
														onCategoryChange={onCategoryChange}
														onCreateCategory={onCreateCategory}
														keyboardCategoryFlow
													/>
												)}
											</TableCell>
											<TableCell className="w-32 max-w-[8rem]">
												<ReviewRowKindSelect
													row={row}
													index={index}
													isCard={isCard}
													onRowTypeChange={onRowTypeChange}
													skipPeerTabStops
												/>
											</TableCell>
											<TableCell className="text-right text-sm">
												<ReviewAmountField
													row={row}
													index={index}
													onAmountChange={onAmountChange}
													alignRight
												/>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</>
				)}
			</div>
		</TooltipProvider>
	);
}

function ReviewImportFilters({
	searchQuery,
	onSearchQueryChange,
	statusFilter,
	onStatusFilterChange,
	filteredCount,
	totalCount,
	statusCounts,
}: {
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	statusFilter: ImportReviewStatusFilter;
	onStatusFilterChange: (value: ImportReviewStatusFilter) => void;
	filteredCount: number;
	totalCount: number;
	statusCounts: Record<ImportReviewStatusFilter, number>;
}) {
	const filtersActive = hasActiveImportReviewFilters(searchQuery, statusFilter);

	return (
		<div className="flex flex-col gap-3 border-b bg-muted/20 p-3 md:p-4">
			<div className="relative min-w-0">
				<RiSearchLine
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<Input
					value={searchQuery}
					onChange={(event) => onSearchQueryChange(event.target.value)}
					placeholder="Buscar por descrição, data ou valor"
					aria-label="Buscar lançamentos na revisão"
					className={cn("pl-9", searchQuery.length > 0 && "pr-9")}
				/>
				{searchQuery.length > 0 ? (
					<button
						type="button"
						onClick={() => onSearchQueryChange("")}
						aria-label="Limpar busca"
						className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<RiCloseLine className="size-4" aria-hidden />
					</button>
				) : null}
			</div>

			<div
				className="flex flex-wrap gap-1.5"
				role="group"
				aria-label="Filtrar por status"
			>
				{IMPORT_REVIEW_STATUS_FILTER_OPTIONS.filter(
					(option) =>
						option.value === "all" ||
						option.value === statusFilter ||
						statusCounts[option.value] > 0,
				).map((option) => {
					const count = statusCounts[option.value];
					const isActive = statusFilter === option.value;

					return (
						<button
							key={option.value}
							type="button"
							onClick={() => onStatusFilterChange(option.value)}
							aria-pressed={isActive}
							className={cn(
								"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isActive
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
							)}
						>
							<span>{option.label}</span>
							<span
								className={cn(
									"tabular-nums",
									isActive
										? "text-primary-foreground/80"
										: "text-muted-foreground/80",
								)}
							>
								{count}
							</span>
						</button>
					);
				})}
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
				<p>
					{filtersActive
						? `${filteredCount} de ${totalCount} lançamento(s) visível(is)`
						: `${totalCount} lançamento(s)`}
				</p>
				{filtersActive ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={() => {
							onSearchQueryChange("");
							onStatusFilterChange("all");
						}}
					>
						Limpar filtros
					</Button>
				) : null}
			</div>
		</div>
	);
}

type ReviewRowHandlers = Pick<
	ReviewTableProps,
	| "onToggle"
	| "onPayerChange"
	| "onCategoryChange"
	| "onCreateCategory"
	| "onRowTypeChange"
	| "onInvoicePaymentCardChange"
	| "onInvoicePaymentPeriodChange"
	| "onTransferPeerAccountChange"
	| "onCreateTransferPeerAccount"
	| "onDescriptionChange"
	| "onInstallmentToggle"
	| "onInstallmentDismiss"
	| "onInstallmentCountChange"
	| "onInstallmentCurrentChange"
	| "onUndoDuplicate"
	| "onEditDuplicate"
	| "onLinkDuplicate"
	| "onDismissLinkSuggestion"
	| "onConvertToInstallment"
	| "onConvertToRecurrence"
	| "onRecurrenceToggle"
	| "onRecurrenceCountChange"
	| "onAmountChange"
	| "onMoveToInvoicePeriod"
	| "isCard"
	| "invoicePeriod"
	| "invoicePeriodExistingIdSet"
	| "periodLockedExistingIds"
>;

type ReviewRowSharedProps = ReviewRowHandlers & {
	row: ReviewRow;
	index: number;
	defaultPayerId: string | null;
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	cardOptions: SelectOption[];
	transferAccountOptions: SelectOption[];
};

function ReviewMobileList({
	entries,
	defaultPayerId,
	allSelected,
	someSelected,
	filtersActive,
	visibleImportableCount,
	payerOptions,
	categoryOptions,
	cardOptions,
	transferAccountOptions,
	onToggle,
	onToggleAll,
	...handlers
}: ReviewRowHandlers & {
	entries: Array<{ row: ReviewRow; index: number }>;
	defaultPayerId: string | null;
	allSelected: boolean;
	someSelected: boolean;
	filtersActive: boolean;
	visibleImportableCount: number;
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	cardOptions: SelectOption[];
	transferAccountOptions: SelectOption[];
	onToggle: (index: number) => void;
	onToggleAll: (selected: boolean) => void;
}) {
	const selectAllLabel = filtersActive
		? `Selecionar visíveis (${visibleImportableCount})`
		: "Selecionar todos";

	return (
		<div className="flex flex-col gap-1.5 p-2 md:hidden">
			<div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2">
				<Checkbox
					checked={allSelected}
					onCheckedChange={(value) => onToggleAll(!!value)}
					aria-label={selectAllLabel}
					data-state={
						!allSelected && someSelected ? "indeterminate" : undefined
					}
				/>
				<span className="text-muted-foreground text-sm">{selectAllLabel}</span>
			</div>

			{entries.map(({ row, index }) => (
				<ReviewMobileCard
					key={getReviewRowKey(row)}
					row={row}
					index={index}
					defaultPayerId={defaultPayerId}
					payerOptions={payerOptions}
					categoryOptions={categoryOptions}
					cardOptions={cardOptions}
					transferAccountOptions={transferAccountOptions}
					onToggle={onToggle}
					{...handlers}
				/>
			))}
		</div>
	);
}

function ReviewMobileCard({
	row,
	index,
	defaultPayerId,
	payerOptions,
	categoryOptions,
	cardOptions,
	transferAccountOptions,
	onToggle,
	onPayerChange,
	onCategoryChange,
	onCreateCategory,
	onRowTypeChange,
	onInvoicePaymentCardChange,
	onInvoicePaymentPeriodChange,
	onTransferPeerAccountChange,
	onCreateTransferPeerAccount,
	onDescriptionChange,
	onInstallmentToggle,
	onInstallmentDismiss,
	onInstallmentCountChange,
	onInstallmentCurrentChange,
	onUndoDuplicate,
	onEditDuplicate,
	onLinkDuplicate,
	onDismissLinkSuggestion,
	onConvertToInstallment,
	onConvertToRecurrence,
	onRecurrenceToggle,
	onRecurrenceCountChange,
	onAmountChange,
	onMoveToInvoicePeriod,
	isCard,
	invoicePeriod,
	invoicePeriodExistingIdSet,
	periodLockedExistingIds,
}: ReviewRowSharedProps & { onToggle: (index: number) => void }) {
	const categoryOptionsForRow = categoryOptions.filter(
		(option) =>
			option.group === categoryGroupByTransactionType[row.transactionType],
	);

	if (isInvoiceExtraReviewRow(row)) {
		return (
			<article
				className={cn(
					"rounded-lg border p-3 shadow-xs transition-colors",
					getInvoiceExtraRowClassName(row),
				)}
			>
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Checkbox
							checked={row.selected}
							onCheckedChange={() => onToggle(index)}
							aria-label={`Marcar remoção de ${row.description}`}
						/>
						<p className="min-w-0 flex-1 text-muted-foreground text-xs">
							{formatDate(row.date)}
						</p>
						<ReviewAmountField
							row={row}
							index={index}
							onAmountChange={onAmountChange}
							mobile
						/>
					</div>
					<div className="space-y-1">
						<p className="min-w-0 font-medium">{row.description}</p>
						<ReviewInvoiceExtraStatus row={row} />
					</div>
					<div className="flex items-center gap-1.5">
						<ReviewVerifiedExistingType
							transactionType={row.transactionType}
							rowKind={row.kind}
							compact
						/>
						<ReviewVerifiedExistingPayer
							payerId={row.payerId}
							payerOptions={payerOptions}
							compact
						/>
						<ReviewVerifiedExistingCategory
							categoryId={row.categoryId}
							categoryOptions={categoryOptions}
							compact
						/>
					</div>
				</div>
			</article>
		);
	}

	if (isVerifiedImportDuplicate(row) || isImportRowLinked(row)) {
		const existingPayerId = resolveReviewExistingPayerId(row, defaultPayerId);
		const existingCategoryId =
			row.duplicateValidation?.existingCategoryId ?? null;

		return (
			<article
				className={cn(
					"rounded-lg border p-3 shadow-xs transition-colors",
					getDuplicateRowClassName(row),
				)}
			>
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<RiCheckboxCircleFill
							className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
							aria-hidden
						/>
						<p className="min-w-0 flex-1 text-muted-foreground text-xs">
							{formatDate(row.date)}
						</p>
						<ReviewAmountField
							row={row}
							index={index}
							onAmountChange={onAmountChange}
							mobile
						/>
					</div>
					{isImportRowLinked(row) ? (
						<div className="space-y-1">
							<p className="min-w-0 font-medium">{row.description}</p>
							<ReviewLinkedStatus row={row} />
						</div>
					) : (
						<ReviewVerifiedDuplicateDescription
							row={row}
							index={index}
							cardOptions={cardOptions}
							onEditDuplicate={onEditDuplicate}
							onUndoDuplicate={onUndoDuplicate}
						/>
					)}
					<ReviewCrossPeriodStatus
						row={row}
						index={index}
						invoicePeriodExistingIdSet={invoicePeriodExistingIdSet}
						periodLockedExistingIds={periodLockedExistingIds}
						onMoveToInvoicePeriod={onMoveToInvoicePeriod}
					/>
					<div className="flex items-center gap-1.5">
						<ReviewVerifiedExistingType
							transactionType={row.transactionType}
							rowKind={row.kind}
							compact
						/>
						<ReviewVerifiedExistingPayer
							payerId={existingPayerId}
							payerOptions={payerOptions}
							compact
						/>
						<ReviewVerifiedExistingCategory
							categoryId={existingCategoryId}
							categoryOptions={categoryOptions}
							compact
						/>
					</div>
				</div>
			</article>
		);
	}

	const isClassified = isReviewRowClassified(row);

	return (
		<article
			className={cn(
				"rounded-lg border shadow-xs transition-colors scroll-mt-20 scroll-mb-44",
				isClassified ? "p-2" : "bg-card p-3",
				!isClassified && "bg-card",
				!isClassified &&
					row.selected &&
					"border-primary/40 ring-1 ring-primary/15",
				getDuplicateRowClassName(row),
				getReviewRowClassifiedClassName(row),
			)}
		>
			<div className={cn(isClassified ? "space-y-1.5" : "space-y-3")}>
				{isClassified ? (
					<div className="flex items-start gap-2">
						<Checkbox
							checked={row.selected}
							onCheckedChange={() => onToggle(index)}
							disabled={isImportLinkSuggestion(row)}
							aria-label={`Selecionar ${row.description}`}
							className="mt-0.5 shrink-0"
							tabIndex={-1}
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<RiCheckboxCircleFill
									className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
									aria-hidden
								/>
								<p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
									{formatDate(row.date)}
								</p>
								<ReviewAmountField
									row={row}
									index={index}
									onAmountChange={onAmountChange}
									mobile
								/>
							</div>
							<ReviewDescriptionField
								row={row}
								index={index}
								isCard={isCard}
								invoicePeriod={invoicePeriod}
								categoryOptions={categoryOptions}
								onDescriptionChange={onDescriptionChange}
								onUndoDuplicate={onUndoDuplicate}
								onLinkDuplicate={onLinkDuplicate}
								onDismissLinkSuggestion={onDismissLinkSuggestion}
								onConvertToInstallment={onConvertToInstallment}
								onConvertToRecurrence={onConvertToRecurrence}
								fullWidth
								compact
								excludeFromTabOrder
							/>
						</div>
					</div>
				) : (
					<>
						<div className="flex items-center gap-2">
							<Checkbox
								checked={row.selected}
								onCheckedChange={() => onToggle(index)}
								disabled={isImportLinkSuggestion(row)}
								aria-label={`Selecionar ${row.description}`}
								className="shrink-0"
								tabIndex={-1}
							/>
							<p className="min-w-0 flex-1 text-muted-foreground text-xs">
								{formatDate(row.date)}
							</p>
							<ReviewAmountField
								row={row}
								index={index}
								onAmountChange={onAmountChange}
								mobile
							/>
						</div>

						<div className="space-y-2">
							<ReviewDescriptionField
								row={row}
								index={index}
								isCard={isCard}
								invoicePeriod={invoicePeriod}
								categoryOptions={categoryOptions}
								onDescriptionChange={onDescriptionChange}
								onUndoDuplicate={onUndoDuplicate}
								onLinkDuplicate={onLinkDuplicate}
								onDismissLinkSuggestion={onDismissLinkSuggestion}
								onConvertToInstallment={onConvertToInstallment}
								onConvertToRecurrence={onConvertToRecurrence}
								fullWidth
								excludeFromTabOrder
							/>
							<ReviewInstallmentFields
								row={row}
								index={index}
								isCard={isCard}
								invoicePeriod={invoicePeriod}
								onInstallmentToggle={onInstallmentToggle}
								onInstallmentDismiss={onInstallmentDismiss}
								onInstallmentCountChange={onInstallmentCountChange}
								onInstallmentCurrentChange={onInstallmentCurrentChange}
							/>
							<ReviewRecurrenceFields
								row={row}
								index={index}
								onRecurrenceToggle={onRecurrenceToggle}
								onRecurrenceCountChange={onRecurrenceCountChange}
							/>
						</div>
					</>
				)}

				{isClassified ? (
					<>
						<ReviewInstallmentFields
							row={row}
							index={index}
							isCard={isCard}
							invoicePeriod={invoicePeriod}
							onInstallmentToggle={onInstallmentToggle}
							onInstallmentDismiss={onInstallmentDismiss}
							onInstallmentCountChange={onInstallmentCountChange}
							onInstallmentCurrentChange={onInstallmentCurrentChange}
							compact
						/>
						<ReviewRecurrenceFields
							row={row}
							index={index}
							onRecurrenceToggle={onRecurrenceToggle}
							onRecurrenceCountChange={onRecurrenceCountChange}
							compact
						/>
						<ReviewDuplicateStatus
							row={row}
							index={index}
							onUndoDuplicate={onUndoDuplicate}
						/>
					</>
				) : null}

				<div className="flex items-center gap-1.5">
					<ReviewRowKindSelect
						row={row}
						index={index}
						isCard={isCard}
						onRowTypeChange={onRowTypeChange}
						compact
						dense={isClassified}
						skipPeerTabStops
					/>
					<ReviewPayerSelect
						row={row}
						index={index}
						payerOptions={payerOptions}
						onPayerChange={onPayerChange}
						compact
						dense={isClassified}
						skipPeerTabStops
					/>
					{row.kind === "invoice_payment" ? (
						<ReviewInvoicePaymentFields
							row={row}
							index={index}
							cardOptions={cardOptions}
							onInvoicePaymentCardChange={onInvoicePaymentCardChange}
							onInvoicePaymentPeriodChange={onInvoicePaymentPeriodChange}
							compact
							dense={isClassified}
							skipPeerTabStops
						/>
					) : row.kind === "transfer" ? (
						<ReviewTransferFields
							row={row}
							index={index}
							accountOptions={transferAccountOptions}
							onTransferPeerAccountChange={onTransferPeerAccountChange}
							onCreateTransferPeerAccount={onCreateTransferPeerAccount}
							compact
							dense={isClassified}
							skipPeerTabStops
						/>
					) : (
						<ReviewCategorySelect
							row={row}
							index={index}
							categoryOptions={categoryOptionsForRow}
							onCategoryChange={onCategoryChange}
							onCreateCategory={onCreateCategory}
							compact
							dense={isClassified}
							keyboardCategoryFlow
						/>
					)}
				</div>
			</div>
		</article>
	);
}

const INSTALLMENT_CARD_DISMISS_DELAY_MS = 2_500;

function ReviewInstallmentFields({
	row,
	index,
	isCard,
	invoicePeriod,
	onInstallmentToggle,
	onInstallmentDismiss,
	onInstallmentCountChange,
	onInstallmentCurrentChange,
	compact = false,
}: {
	row: ReviewRow;
	index: number;
	isCard: boolean;
	invoicePeriod: string | null;
	onInstallmentToggle: (index: number, enabled: boolean) => void;
	onInstallmentDismiss: (index: number) => void;
	onInstallmentCountChange: (index: number, installmentCount: number) => void;
	onInstallmentCurrentChange: (
		index: number,
		currentInstallment: number,
	) => void;
	compact?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const installment = row.installmentImport;

	useEffect(() => {
		if (!installment || installment.enabled) {
			return;
		}

		const timer = window.setTimeout(() => {
			onInstallmentDismiss(index);
		}, INSTALLMENT_CARD_DISMISS_DELAY_MS);

		return () => window.clearTimeout(timer);
	}, [index, installment, onInstallmentDismiss]);

	if (
		!isCard ||
		!invoicePeriod ||
		row.kind !== "transaction" ||
		row.transactionType !== "expense" ||
		!installment
	) {
		return null;
	}
	const preview = installment.enabled
		? buildInstallmentImportPreview(
				invoicePeriod,
				installment.currentInstallment,
				installment.installmentCount,
			)
		: null;

	const summary = installment.enabled
		? preview
			? `${installment.installmentCount} parcelas de ${installment.name} · ${formatCurrency(row.amount)} · ${preview.firstLabel}–${preview.lastLabel}`
			: `${installment.installmentCount} parcelas de ${installment.name} · ${formatCurrency(row.amount)}`
		: "Parcelamento detectado no lançamento";

	return (
		<Collapsible
			open={expanded}
			onOpenChange={setExpanded}
			className={cn(
				"rounded-md border border-dashed border-border/70 bg-muted/20",
				compact ? "p-2" : "p-3",
			)}
		>
			<div className="flex items-center gap-2">
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex min-w-0 flex-1 items-center gap-2 text-left"
					>
						<RiArrowDownSLine
							className={cn(
								"size-4 shrink-0 text-muted-foreground transition-transform",
								expanded && "rotate-180",
							)}
							aria-hidden
						/>
						<div className="min-w-0">
							<p className="truncate text-sm font-medium text-foreground">
								Parcelamento
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{summary}
							</p>
						</div>
					</button>
				</CollapsibleTrigger>
				<Switch
					checked={installment.enabled}
					onCheckedChange={(checked) => {
						if (!checked) {
							setExpanded(false);
						}
						onInstallmentToggle(index, checked);
					}}
					onClick={(event) => event.stopPropagation()}
					aria-label="Importar como parcelamento"
				/>
			</div>

			<CollapsibleContent className="mt-3 space-y-3 overflow-hidden data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
				{installment.enabled ? (
					<>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label className="text-muted-foreground text-xs">
									Parcela atual
								</Label>
								<Input
									type="number"
									min={1}
									max={installment.installmentCount}
									value={installment.currentInstallment}
									onChange={(event) => {
										const parsed = Number.parseInt(event.target.value, 10);
										if (!Number.isNaN(parsed)) {
											onInstallmentCurrentChange(index, parsed);
										}
									}}
									className="h-8 text-xs"
								/>
							</div>
							<div className="space-y-1.5">
								<Label className="text-muted-foreground text-xs">
									Total de parcelas
								</Label>
								<Input
									type="number"
									min={2}
									max={60}
									value={installment.installmentCount}
									onChange={(event) => {
										const parsed = Number.parseInt(event.target.value, 10);
										if (!Number.isNaN(parsed)) {
											onInstallmentCountChange(index, parsed);
										}
									}}
									className="h-8 text-xs"
								/>
							</div>
						</div>

						{preview ? (
							<p className="text-muted-foreground text-xs leading-relaxed">
								Serão criadas {installment.installmentCount} parcelas de{" "}
								<MoneyValues
									amount={-row.amount}
									className="inline text-xs text-foreground"
								/>{" "}
								nas faturas de {preview.firstLabel} a {preview.lastLabel}.
							</p>
						) : null}
					</>
				) : (
					<p className="text-muted-foreground text-xs leading-relaxed">
						Este lançamento parece ser uma parcela de compra no cartão. Ative
						para importar o parcelamento completo.
					</p>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

function ReviewRecurrenceFields({
	row,
	index,
	onRecurrenceToggle,
	onRecurrenceCountChange,
	compact = false,
}: {
	row: ReviewRow;
	index: number;
	onRecurrenceToggle: (index: number, enabled: boolean) => void;
	onRecurrenceCountChange: (index: number, recurrenceCount: number) => void;
	compact?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);

	if (row.kind !== "transaction" || !row.recurrenceImport) {
		return null;
	}

	const recurrence = row.recurrenceImport;
	const summary = recurrence.enabled
		? `${recurrence.recurrenceCount} repetições de ${row.description} · ${formatCurrency(row.amount)}/mês`
		: "Recorrência configurada para este lançamento";

	return (
		<Collapsible
			open={expanded}
			onOpenChange={setExpanded}
			className={cn(
				"rounded-md border border-dashed border-border/70 bg-muted/20",
				compact ? "p-2" : "p-3",
			)}
		>
			<div className="flex items-center gap-2">
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex min-w-0 flex-1 items-center gap-2 text-left"
					>
						<RiArrowDownSLine
							className={cn(
								"size-4 shrink-0 text-muted-foreground transition-transform",
								expanded && "rotate-180",
							)}
							aria-hidden
						/>
						<div className="min-w-0">
							<p className="truncate font-medium text-foreground text-sm">
								Recorrência
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{summary}
							</p>
						</div>
					</button>
				</CollapsibleTrigger>
				<Switch
					checked={recurrence.enabled}
					onCheckedChange={(checked) => onRecurrenceToggle(index, checked)}
					onClick={(event) => event.stopPropagation()}
					aria-label="Importar como recorrência"
				/>
			</div>

			<CollapsibleContent className="mt-3 space-y-3 overflow-hidden data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
				{recurrence.enabled ? (
					<div className="space-y-1.5">
						<Label className="text-muted-foreground text-xs">Repetir por</Label>
						<Input
							type="number"
							min={2}
							max={60}
							value={recurrence.recurrenceCount}
							onChange={(event) => {
								const parsed = Number.parseInt(event.target.value, 10);
								if (!Number.isNaN(parsed)) {
									onRecurrenceCountChange(index, parsed);
								}
							}}
							className="h-8 text-xs"
						/>
					</div>
				) : (
					<p className="text-muted-foreground text-xs leading-relaxed">
						Ative para importar este lançamento como uma série de repetições
						mensais.
					</p>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

function formatAmountEditInputValue(value: number): string {
	if (!Number.isFinite(value)) return "";
	return Math.max(0, Math.round(value * 100) / 100).toFixed(2);
}

function ReviewAmountField({
	row,
	index,
	onAmountChange,
	alignRight = false,
	mobile = false,
}: {
	row: ReviewRow;
	index: number;
	onAmountChange: (index: number, amount: number) => void;
	alignRight?: boolean;
	mobile?: boolean;
}) {
	const registeredTransactionId =
		resolveExistingTransactionIdForAmountEdit(row);

	const isRegistered = registeredTransactionId !== null;
	const fileEditable =
		row.kind === "transaction" &&
		!row.reimported &&
		!row.linked &&
		!row.duplicateValidation &&
		!row.existingTransactionId;
	const isEditable = isRegistered || fileEditable;

	const initialAmount = isRegistered
		? (row.existingAmountCorrection?.amount ?? row.existingAmount ?? row.amount)
		: row.amount;

	const hintText = isRegistered
		? row.existingAmount != null
			? `Cadastro: ${formatCurrency(row.existingAmount)}`
			: null
		: `Arquivo: ${formatCurrency(row.amount)}`;

	const [draftValue, setDraftValue] = useState<string>(() =>
		formatAmountEditInputValue(initialAmount),
	);

	useEffect(() => {
		setDraftValue(formatAmountEditInputValue(initialAmount));
	}, [initialAmount]);

	const commitDraft = () => {
		const parsed = Number.parseFloat(draftValue);
		if (!Number.isFinite(parsed) || parsed < 0) {
			setDraftValue(formatAmountEditInputValue(initialAmount));
			return;
		}
		const rounded = Math.round(parsed * 100) / 100;
		setDraftValue(formatAmountEditInputValue(rounded));
		onAmountChange(index, rounded);
	};

	return (
		<div
			className={cn(
				"flex flex-col gap-0.5",
				alignRight && "items-end",
				mobile && "shrink-0 items-end",
			)}
		>
			<Input
				type="number"
				inputMode="decimal"
				min="0"
				step="0.01"
				value={draftValue}
				onChange={(event) => setDraftValue(event.target.value)}
				onBlur={commitDraft}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.currentTarget.blur();
					}
				}}
				disabled={!isEditable}
				aria-label={
					isRegistered
						? "Valor do lançamento (correção do cadastro)"
						: "Valor do lançamento"
				}
				className={cn(
					"h-8 tabular-nums",
					mobile ? "w-24 text-xs" : "w-28 text-sm",
					alignRight && "text-right",
				)}
			/>
			{hintText ? (
				<span className="text-[10px] text-muted-foreground">{hintText}</span>
			) : null}
		</div>
	);
}

function ReviewDescriptionField({
	row,
	index,
	isCard,
	invoicePeriod,
	categoryOptions,
	onDescriptionChange,
	onUndoDuplicate,
	onLinkDuplicate,
	onDismissLinkSuggestion,
	onConvertToInstallment,
	onConvertToRecurrence,
	fullWidth = false,
	compact = false,
	excludeFromTabOrder = false,
}: Pick<
	ReviewRowSharedProps,
	| "row"
	| "index"
	| "categoryOptions"
	| "onDescriptionChange"
	| "onUndoDuplicate"
	| "onLinkDuplicate"
	| "onDismissLinkSuggestion"
	| "onConvertToInstallment"
	| "onConvertToRecurrence"
	| "isCard"
	| "invoicePeriod"
> & { fullWidth?: boolean; compact?: boolean; excludeFromTabOrder?: boolean }) {
	const fieldClassName = cn(
		"w-full bg-transparent outline-none focus:rounded focus:ring-1 focus:ring-ring",
		compact ? "text-xs leading-tight" : "text-sm",
	);

	useEffect(() => {
		const fixedDescription = normalizeImportedText(row.description);
		if (fixedDescription !== row.description) {
			onDescriptionChange(index, fixedDescription);
		}
	}, [index, onDescriptionChange, row.description]);

	const canConvert =
		!compact &&
		row.kind === "transaction" &&
		!isImportRowResolved(row) &&
		!isImportLinkSuggestion(row);
	const canConvertToInstallment =
		canConvert &&
		isCard &&
		!!invoicePeriod &&
		row.transactionType === "expense" &&
		!row.recurrenceImport?.enabled &&
		!row.installmentImport?.enabled;
	const canConvertToRecurrence = canConvert && !row.installmentImport?.enabled;

	const convertActions =
		canConvertToInstallment || canConvertToRecurrence ? (
			<div className="flex shrink-0 items-center gap-0.5">
				{canConvertToInstallment ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
								onClick={() => onConvertToInstallment(index)}
								aria-label="Converter em parcelamento"
							>
								{getConditionIcon("Parcelado")}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Parcelamento</TooltipContent>
					</Tooltip>
				) : null}
				{canConvertToRecurrence ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
								onClick={() => onConvertToRecurrence(index)}
								aria-label="Converter em recorrência"
							>
								{getConditionIcon("Recorrente")}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Recorrência</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		) : null;

	return (
		<div className={cn("min-w-0", compact ? "space-y-0" : "space-y-1")}>
			<div
				className={cn("flex gap-1", fullWidth ? "items-start" : "items-center")}
			>
				{convertActions}
				{fullWidth && !compact ? (
					<textarea
						value={row.description}
						onChange={(event) => onDescriptionChange(index, event.target.value)}
						rows={2}
						tabIndex={excludeFromTabOrder ? -1 : undefined}
						className={cn(
							fieldClassName,
							// `field-sizing-content` cresce com o texto: descrição de extrato
							// passa de 130 caracteres e duas linhas fixas cortavam o fim,
							// que é onde ficam agência e conta. `rows` vira o piso.
							"min-h-10 min-w-0 flex-1 resize-none wrap-break-word leading-snug field-sizing-content",
						)}
					/>
				) : (
					<input
						type="text"
						value={row.description}
						onChange={(event) => onDescriptionChange(index, event.target.value)}
						tabIndex={excludeFromTabOrder ? -1 : undefined}
						className={cn(
							fieldClassName,
							"min-w-0 flex-1",
							compact && "truncate font-medium",
						)}
					/>
				)}
			</div>
			{!compact && row.kind === "invoice_payment" && (
				<Badge variant="outline" className="text-[10px]">
					Pagamento de fatura
				</Badge>
			)}
			{!compact && row.kind === "transfer" && (
				<Badge variant="outline" className="text-[10px]">
					Transferência
				</Badge>
			)}
			{!compact ? (
				<>
					<ReviewDuplicateStatus
						row={row}
						index={index}
						onUndoDuplicate={onUndoDuplicate}
					/>
					<ReviewLinkSuggestionStatus
						row={row}
						index={index}
						categoryOptions={categoryOptions}
						onLinkDuplicate={onLinkDuplicate}
						onDismissLinkSuggestion={onDismissLinkSuggestion}
					/>
					<ReviewLinkedStatus row={row} />
				</>
			) : null}
		</div>
	);
}

function ReviewRowKindSelect({
	row,
	index,
	isCard,
	onRowTypeChange,
	fullWidth = false,
	compact = false,
	dense = false,
	skipPeerTabStops = false,
}: {
	row: ReviewRow;
	index: number;
	isCard: boolean;
	onRowTypeChange: (
		index: number,
		type: "expense" | "income" | "invoice_payment" | "transfer",
	) => void;
	fullWidth?: boolean;
	compact?: boolean;
	dense?: boolean;
	skipPeerTabStops?: boolean;
}) {
	const controlSize = dense ? "size-9" : "size-8";
	const select = (
		<Select
			value={
				row.kind === "invoice_payment"
					? "invoice_payment"
					: row.kind === "transfer"
						? "transfer"
						: row.transactionType
			}
			onValueChange={(value) => {
				if (value === "invoice_payment") {
					onRowTypeChange(index, "invoice_payment");
					return;
				}
				if (value === "transfer") {
					onRowTypeChange(index, "transfer");
					return;
				}
				onRowTypeChange(index, value as "expense" | "income");
			}}
		>
			<SelectTrigger
				size={compact ? "sm" : "default"}
				tabIndex={skipPeerTabStops ? -1 : undefined}
				className={cn(
					compact
						? cn(
								"shrink-0 justify-center p-0 [&>svg]:hidden",
								controlSize,
								getReviewRowKindIconClassName(row),
							)
						: "h-8 gap-2 text-xs",
					fullWidth && !compact && "w-full",
				)}
				aria-label={compact ? getReviewRowKindLabel(row) : undefined}
			>
				{compact ? (
					<span className="flex size-full items-center justify-center">
						{getReviewRowKindIcon(row)}
					</span>
				) : (
					<span className="flex min-w-0 items-center gap-2">
						<ReviewRowKindOptionIcon
							value={
								row.kind === "invoice_payment"
									? "invoice_payment"
									: row.kind === "transfer"
										? "transfer"
										: row.transactionType
							}
						/>
						<span className="truncate">{getReviewRowKindLabel(row)}</span>
					</span>
				)}
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="expense" textValue="Despesa">
					<span className="flex items-center gap-2">
						<ReviewRowKindOptionIcon value="expense" />
						<span>Despesa</span>
					</span>
				</SelectItem>
				<SelectItem value="income" textValue="Receita">
					<span className="flex items-center gap-2">
						<ReviewRowKindOptionIcon value="income" />
						<span>Receita</span>
					</span>
				</SelectItem>
				<SelectItem value="invoice_payment" textValue="Pgto. fatura">
					<span className="flex items-center gap-2">
						<ReviewRowKindOptionIcon value="invoice_payment" />
						<span>Pgto. fatura</span>
					</span>
				</SelectItem>
				{!isCard ? (
					<SelectItem value="transfer" textValue="Transferência">
						<span className="flex items-center gap-2">
							<ReviewRowKindOptionIcon value="transfer" />
							<span>Transferência</span>
						</span>
					</SelectItem>
				) : null}
			</SelectContent>
		</Select>
	);

	if (!compact) return select;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{select}</TooltipTrigger>
			<TooltipContent>{getReviewRowKindLabel(row)}</TooltipContent>
		</Tooltip>
	);
}

function ReviewInvoicePaymentFields({
	row,
	index,
	cardOptions,
	onInvoicePaymentCardChange,
	onInvoicePaymentPeriodChange,
	fullWidth = false,
	compact = false,
	dense = false,
	skipPeerTabStops = false,
}: {
	row: ReviewRow;
	index: number;
	cardOptions: SelectOption[];
	onInvoicePaymentCardChange: (index: number, cardId: string | null) => void;
	onInvoicePaymentPeriodChange: (index: number, period: string | null) => void;
	fullWidth?: boolean;
	compact?: boolean;
	dense?: boolean;
	skipPeerTabStops?: boolean;
}) {
	const selectedCard = cardOptions.find(
		(option) => option.value === row.invoicePaymentCardId,
	);
	const controlHeight = dense ? "h-7" : "h-8";

	return (
		<div
			className={cn(
				compact
					? "flex min-w-0 flex-1 items-center gap-1"
					: "flex flex-col gap-1.5",
				fullWidth ? "w-full" : compact ? undefined : "min-w-[12rem]",
			)}
		>
			<Select
				value={row.invoicePaymentCardId ?? ""}
				onValueChange={(value) =>
					onInvoicePaymentCardChange(index, value || null)
				}
			>
				<SelectTrigger
					tabIndex={skipPeerTabStops ? -1 : undefined}
					className={cn(controlHeight, "text-xs", compact && "min-w-0 flex-1")}
				>
					<SelectValue placeholder="Cartão…">
						{selectedCard ? (
							<AccountCardSelectContent
								label={selectedCard.label}
								logo={selectedCard.logo}
								isCartao
							/>
						) : null}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{cardOptions.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							<AccountCardSelectContent
								label={option.label}
								logo={option.logo}
								isCartao
							/>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<PeriodPicker
				value={row.invoicePaymentPeriod ?? ""}
				onChange={(value) => onInvoicePaymentPeriodChange(index, value || null)}
				placeholder="Fatura…"
				size="sm"
				tabIndex={skipPeerTabStops ? -1 : undefined}
				className={cn(
					controlHeight,
					"justify-start text-xs",
					compact ? "w-[5.5rem] shrink-0 px-2" : "w-full",
				)}
			/>
		</div>
	);
}

function ReviewTransferFields({
	row,
	index,
	accountOptions,
	onTransferPeerAccountChange,
	onCreateTransferPeerAccount,
	fullWidth = false,
	compact = false,
	dense = false,
	skipPeerTabStops = false,
}: {
	row: ReviewRow;
	index: number;
	accountOptions: SelectOption[];
	onTransferPeerAccountChange: (
		index: number,
		accountId: string | null,
	) => void;
	onCreateTransferPeerAccount: (index: number) => void;
	fullWidth?: boolean;
	compact?: boolean;
	dense?: boolean;
	skipPeerTabStops?: boolean;
}) {
	const controlHeight = dense ? "h-7" : "h-8";
	const selectedAccount = accountOptions.find(
		(option) => option.value === row.transferPeerAccountId,
	);
	const peerLabel =
		row.transactionType === "income" ? "Conta origem" : "Conta destino";

	return (
		<div
			className={cn(
				compact
					? "flex min-w-0 flex-1 items-center gap-1"
					: "flex flex-col gap-1.5",
				fullWidth ? "w-full" : compact ? undefined : "min-w-[12rem]",
			)}
		>
			{!compact ? (
				<Label className="text-xs text-muted-foreground">{peerLabel}</Label>
			) : null}
			<Select
				value={row.transferPeerAccountId ?? ""}
				onValueChange={(value) =>
					onTransferPeerAccountChange(index, value || null)
				}
			>
				<SelectTrigger
					tabIndex={skipPeerTabStops ? -1 : undefined}
					className={cn(
						controlHeight,
						"text-xs",
						compact && "min-w-0 flex-1",
						!row.transferPeerAccountId && "border-destructive/40",
					)}
					aria-label={peerLabel}
				>
					<SelectValue
						placeholder={
							compact ? "Conta…" : `Selecione a ${peerLabel.toLowerCase()}`
						}
					>
						{selectedAccount ? (
							<AccountCardSelectContent
								label={selectedAccount.label}
								logo={selectedAccount.logo}
							/>
						) : null}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{accountOptions.length === 0 ? (
						<div className="px-2 py-4 text-center text-sm text-muted-foreground">
							Nenhuma conta cadastrada
						</div>
					) : (
						accountOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								<AccountCardSelectContent
									label={option.label}
									logo={option.logo}
								/>
							</SelectItem>
						))
					)}
					<SelectCreateAction
						label="Adicionar conta"
						onClick={() => onCreateTransferPeerAccount(index)}
					/>
				</SelectContent>
			</Select>
		</div>
	);
}

function ReviewCategorySelect({
	row,
	index,
	categoryOptions,
	onCategoryChange,
	onCreateCategory,
	fullWidth = false,
	compact = false,
	dense = false,
	keyboardCategoryFlow = false,
}: {
	row: ReviewRow;
	index: number;
	categoryOptions: SelectOption[];
	onCategoryChange: (index: number, categoryId: string | null) => void;
	onCreateCategory: (index: number) => void;
	fullWidth?: boolean;
	compact?: boolean;
	dense?: boolean;
	keyboardCategoryFlow?: boolean;
}) {
	const categoryGroups = groupAndSortCategories(categoryOptions);

	return (
		<CategorySearchSelect
			value={row.categoryId ?? ""}
			onValueChange={(value) => onCategoryChange(index, value || null)}
			categoryGroups={categoryGroups}
			categoryOptions={categoryOptions}
			placeholder="Categoria…"
			onCreateCategory={() => onCreateCategory(index)}
			enableCategoryTabFlow={keyboardCategoryFlow}
			triggerClassName={cn(
				dense ? "h-7" : "h-8",
				"text-xs",
				compact ? "min-w-0 flex-1" : fullWidth && "w-full",
				row.categoryId &&
					(row.aiSuggestion?.category
						? "border-violet-500/35 bg-violet-500/5"
						: "border-emerald-500/30 bg-emerald-500/5"),
			)}
		/>
	);
}

function ReviewPayerSelect({
	row,
	index,
	payerOptions,
	onPayerChange,
	fullWidth = false,
	compact = false,
	dense = false,
	skipPeerTabStops = false,
}: {
	row: ReviewRow;
	index: number;
	payerOptions: SelectOption[];
	onPayerChange: (index: number, payerId: string | null) => void;
	fullWidth?: boolean;
	compact?: boolean;
	dense?: boolean;
	skipPeerTabStops?: boolean;
}) {
	const payerOption = payerOptions.find(
		(option) => option.value === row.payerId,
	);
	const compactAvatarTrigger = compact && !fullWidth;

	const select = (
		<Select
			value={row.payerId ?? ""}
			onValueChange={(value) => onPayerChange(index, value || null)}
		>
			<SelectTrigger
				size={compactAvatarTrigger ? "sm" : "default"}
				tabIndex={skipPeerTabStops ? -1 : undefined}
				className={cn(
					"text-xs",
					compactAvatarTrigger
						? "size-9 shrink-0 justify-center p-0 [&>svg]:hidden"
						: cn(
								compact || !fullWidth
									? cn(
											dense ? "size-7" : "size-8",
											"shrink-0 justify-center p-0 [&>svg]:hidden",
										)
									: cn(dense ? "h-7" : "h-8", fullWidth && "w-full"),
							),
				)}
				aria-label={payerOption?.label ?? "Pessoa"}
			>
				<SelectValue placeholder={compact ? undefined : "Pessoa…"}>
					{payerOption ? (
						<PayerSelectTriggerValue
							label={payerOption.label}
							avatarUrl={payerOption.avatarUrl}
							showLabel={fullWidth}
							avatarClassName={compactAvatarTrigger ? "size-8" : undefined}
						/>
					) : null}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{payerOptions.map((opt) => (
					<SelectItem key={opt.value} value={opt.value} textValue={opt.label}>
						<PayerSelectContent label={opt.label} avatarUrl={opt.avatarUrl} />
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	if (!payerOption) {
		return (
			<div
				className={cn(
					"flex justify-center",
					compact ? "shrink-0" : fullWidth ? "w-full" : "shrink-0",
				)}
			>
				{select}
			</div>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"flex justify-center",
						compact ? "shrink-0" : fullWidth ? "w-full" : "shrink-0",
					)}
				>
					{select}
				</div>
			</TooltipTrigger>
			<TooltipContent>{payerOption.label}</TooltipContent>
		</Tooltip>
	);
}
