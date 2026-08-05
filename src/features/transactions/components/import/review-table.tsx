"use client";

import {
	RiArrowDownSLine,
	RiArrowRightDownLine,
	RiArrowRightUpLine,
	RiBankCardLine,
	RiCheckboxCircleFill,
	RiMore2Line,
} from "@remixicon/react";
import { useState, type ReactNode } from "react";
import { CategorySearchSelect } from "@/features/transactions/components/dialogs/transaction-dialog/category-search-select";
import {
	AccountCardSelectContent,
	PayerSelectContent,
	PayerSelectTriggerValue,
} from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import { groupAndSortCategories } from "@/features/transactions/lib/category-helpers";
import {
	buildInstallmentImportPreview,
	createManualInstallmentImport,
	createManualRecurrenceImport,
	type ReviewInstallmentImport,
	type ReviewRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import { getConditionIcon } from "@/shared/utils/icons";
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
import { Switch } from "@/shared/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
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
import type { ImportDuplicateValidation } from "@/features/transactions/lib/import-duplicate-match";
import { isVerifiedImportDuplicate } from "@/features/transactions/lib/import-duplicate-match";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

function getDuplicateRowClassName(row: ReviewRow) {
	if (isVerifiedImportDuplicate(row)) {
		return "border-emerald-500/40 bg-emerald-500/8";
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

function ReviewVerifiedDuplicateDescription({
	row,
	index,
	onEditDuplicate,
	onUndoDuplicate,
}: {
	row: ReviewRow;
	index: number;
	onEditDuplicate: (index: number) => void;
	onUndoDuplicate: (index: number) => void;
}) {
	return (
		<div className="flex min-w-0 items-center gap-1.5">
			<p className="min-w-0 flex-1 truncate font-medium">{row.description}</p>
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
					compact && "size-8 shrink-0 justify-center px-0",
				)}
			>
				{compact ? "—" : "Sem pessoa"}
			</ReviewVerifiedExistingValue>
		);
	}

	const content = (
		<ReviewVerifiedExistingValue
			className={cn(
				"gap-2",
				fullWidth && "w-full",
				compact && "size-8 shrink-0 justify-center px-0",
			)}
		>
			<PayerSelectTriggerValue
				label={payerOption.label}
				avatarUrl={payerOption.avatarUrl}
				showLabel={!compact}
			/>
		</ReviewVerifiedExistingValue>
	);

	if (!compact) return content;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent>{payerOption.label}</TooltipContent>
		</Tooltip>
	);
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
	return row.transactionType === "income" ? "Receita" : "Despesa";
}

function getReviewRowKindIcon(row: ReviewRow) {
	if (row.kind === "invoice_payment") {
		return <RiBankCardLine className="size-3.5" aria-hidden />;
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

	if (row.transactionType === "income") {
		return "border-success/30 bg-success/5 text-success";
	}

	return "border-destructive/30 bg-destructive/5 text-destructive";
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
			{transactionType === "income" ? "Receita" : "Despesa"}
		</ReviewVerifiedExistingValue>
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
					Os dados da fatura batem com o lançamento existente.
				</p>
			) : null}

			{hasMismatch && validation ? (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
					<p className="font-medium text-amber-800 dark:text-amber-300">
						Diferenças encontradas:
					</p>
					<ul className="mt-1 space-y-1 text-amber-900/90 dark:text-amber-100/90">
						{validation.mismatches.map((mismatch) => (
							<li key={mismatch.field}>
								<span className="font-medium">{mismatch.label}:</span> fatura{" "}
								{mismatch.imported} · cadastro {mismatch.existing}
							</li>
						))}
					</ul>
				</div>
			) : null}
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

export type ReviewRowKind = "transaction" | "invoice_payment";

export type ReviewRow = ImportedTransaction & {
	selected: boolean;
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
	categoryId: string | null;
	payerId: string | null;
	kind: ReviewRowKind;
	invoicePaymentCardId: string | null;
	invoicePaymentPeriod: string | null;
	installmentImport: ReviewInstallmentImport | null;
	recurrenceImport: ReviewRecurrenceImport | null;
	reimported?: boolean;
};

interface ReviewTableProps {
	rows: ReviewRow[];
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	cardOptions: SelectOption[];
	isCard: boolean;
	invoicePeriod: string | null;
	onToggle: (index: number) => void;
	onToggleAll: (selected: boolean) => void;
	onPayerChange: (index: number, payerId: string | null) => void;
	onCategoryChange: (index: number, categoryId: string | null) => void;
	onCreateCategory: (index: number) => void;
	onRowTypeChange: (
		index: number,
		type: "expense" | "income" | "invoice_payment",
	) => void;
	onInvoicePaymentCardChange: (index: number, cardId: string | null) => void;
	onInvoicePaymentPeriodChange: (index: number, period: string | null) => void;
	onDescriptionChange: (index: number, description: string) => void;
	onInstallmentToggle: (index: number, enabled: boolean) => void;
	onInstallmentCountChange: (index: number, installmentCount: number) => void;
	onInstallmentCurrentChange: (index: number, currentInstallment: number) => void;
	onUndoDuplicate: (index: number) => void;
	onEditDuplicate: (index: number) => void;
	onConvertToInstallment: (index: number) => void;
	onConvertToRecurrence: (index: number) => void;
	onRecurrenceToggle: (index: number, enabled: boolean) => void;
	onRecurrenceCountChange: (index: number, recurrenceCount: number) => void;
}

export function ReviewTable({
	rows,
	payerOptions,
	categoryOptions,
	cardOptions,
	isCard,
	invoicePeriod,
	onToggle,
	onToggleAll,
	onPayerChange,
	onCategoryChange,
	onCreateCategory,
	onRowTypeChange,
	onInvoicePaymentCardChange,
	onInvoicePaymentPeriodChange,
	onDescriptionChange,
	onInstallmentToggle,
	onInstallmentCountChange,
	onInstallmentCurrentChange,
	onUndoDuplicate,
	onEditDuplicate,
	onConvertToInstallment,
	onConvertToRecurrence,
	onRecurrenceToggle,
	onRecurrenceCountChange,
}: ReviewTableProps) {
	const importableRows = rows.filter((row) => !isVerifiedImportDuplicate(row));
	const allSelected =
		importableRows.length > 0 && importableRows.every((row) => row.selected);
	const someSelected = importableRows.some((row) => row.selected);

	return (
		<TooltipProvider>
			<div className="rounded-lg border">
				<ReviewMobileList
					rows={rows}
					allSelected={allSelected}
					someSelected={someSelected}
					payerOptions={payerOptions}
					categoryOptions={categoryOptions}
					cardOptions={cardOptions}
					isCard={isCard}
					invoicePeriod={invoicePeriod}
					onToggle={onToggle}
					onToggleAll={onToggleAll}
					onPayerChange={onPayerChange}
					onCategoryChange={onCategoryChange}
					onCreateCategory={onCreateCategory}
					onRowTypeChange={onRowTypeChange}
					onInvoicePaymentCardChange={onInvoicePaymentCardChange}
					onInvoicePaymentPeriodChange={onInvoicePaymentPeriodChange}
					onDescriptionChange={onDescriptionChange}
					onInstallmentToggle={onInstallmentToggle}
					onInstallmentCountChange={onInstallmentCountChange}
					onInstallmentCurrentChange={onInstallmentCurrentChange}
					onUndoDuplicate={onUndoDuplicate}
					onEditDuplicate={onEditDuplicate}
					onConvertToInstallment={onConvertToInstallment}
					onConvertToRecurrence={onConvertToRecurrence}
					onRecurrenceToggle={onRecurrenceToggle}
					onRecurrenceCountChange={onRecurrenceCountChange}
				/>

				<Table className="hidden md:table">
					<TableHeader className="sticky top-0 z-10 bg-background">
						<TableRow>
							<TableHead className="w-10">
								<Checkbox
									checked={allSelected}
									onCheckedChange={(v) => onToggleAll(!!v)}
									aria-label="Selecionar todas"
									data-state={
										!allSelected && someSelected ? "indeterminate" : undefined
									}
								/>
							</TableHead>
							<TableHead className="w-24">Data</TableHead>
							<TableHead>Descrição</TableHead>
							<TableHead className="w-44 max-md:w-12">Pessoa</TableHead>
							<TableHead className="w-44">Categoria / Fatura</TableHead>
							<TableHead className="w-28">Tipo</TableHead>
							<TableHead className="w-28 text-right">Valor</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row, index) => {
							const categoryOptionsForRow = categoryOptions.filter(
								(option) =>
									option.group ===
									categoryGroupByTransactionType[row.transactionType],
							);

							if (isVerifiedImportDuplicate(row)) {
								const existingPayerId =
									row.duplicateValidation?.existingPayerId ?? null;
								const existingCategoryId =
									row.duplicateValidation?.existingCategoryId ?? null;

								return (
									<TableRow
										key={row.externalId ?? `${row.date}-${index}`}
										className={getDuplicateRowClassName(row)}
									>
										<TableCell className="w-10">
											<RiCheckboxCircleFill
												className="size-5 text-emerald-600 dark:text-emerald-400"
												aria-label="Lançamento conferido"
											/>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatDate(row.date)}
										</TableCell>
										<TableCell className="max-w-[280px] text-sm">
											<ReviewVerifiedDuplicateDescription
												row={row}
												index={index}
												onEditDuplicate={onEditDuplicate}
												onUndoDuplicate={onUndoDuplicate}
											/>
										</TableCell>
										<TableCell className="max-md:w-12">
											<ReviewVerifiedExistingPayer
												payerId={existingPayerId}
												payerOptions={payerOptions}
											/>
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
											/>
										</TableCell>
										<TableCell className="text-right text-sm">
											<MoneyValues
												amount={
													row.transactionType === "expense"
														? -row.amount
														: row.amount
												}
												showPositiveSign={row.transactionType === "income"}
												className={
													row.transactionType === "income"
														? "text-success"
														: "text-foreground"
												}
											/>
										</TableCell>
									</TableRow>
								);
							}

							return (
								<TableRow
									key={row.externalId ?? `${row.date}-${index}`}
									className={getDuplicateRowClassName(row)}
								>
									<TableCell>
										<Checkbox
											checked={row.selected}
											onCheckedChange={() => onToggle(index)}
											aria-label={`Selecionar ${row.description}`}
										/>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatDate(row.date)}
									</TableCell>
									<TableCell className="max-w-[200px] text-sm">
										<div className="space-y-2">
											<ReviewDescriptionField
												row={row}
												index={index}
												isCard={isCard}
												invoicePeriod={invoicePeriod}
												onDescriptionChange={onDescriptionChange}
												onUndoDuplicate={onUndoDuplicate}
												onConvertToInstallment={onConvertToInstallment}
												onConvertToRecurrence={onConvertToRecurrence}
											/>
											<ReviewInstallmentFields
												row={row}
												index={index}
												isCard={isCard}
												invoicePeriod={invoicePeriod}
												onInstallmentToggle={onInstallmentToggle}
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
									</TableCell>
									<TableCell className="max-md:w-12">
										<ReviewPayerSelect
											row={row}
											index={index}
											payerOptions={payerOptions}
											onPayerChange={onPayerChange}
										/>
									</TableCell>
									<TableCell>
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
											/>
										) : (
											<ReviewCategorySelect
												row={row}
												index={index}
												categoryOptions={categoryOptionsForRow}
												onCategoryChange={onCategoryChange}
												onCreateCategory={onCreateCategory}
											/>
										)}
									</TableCell>
									<TableCell>
										<ReviewRowKindSelect
											row={row}
											index={index}
											onRowTypeChange={onRowTypeChange}
										/>
									</TableCell>
									<TableCell className="text-right text-sm">
										<MoneyValues
											amount={
												row.transactionType === "expense"
													? -row.amount
													: row.amount
											}
											showPositiveSign={row.transactionType === "income"}
											className={
												row.transactionType === "income"
													? "text-success"
													: "text-foreground"
											}
										/>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</TooltipProvider>
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
	| "onDescriptionChange"
	| "onInstallmentToggle"
	| "onInstallmentCountChange"
	| "onInstallmentCurrentChange"
	| "onUndoDuplicate"
	| "onEditDuplicate"
	| "onConvertToInstallment"
	| "onConvertToRecurrence"
	| "onRecurrenceToggle"
	| "onRecurrenceCountChange"
	| "isCard"
	| "invoicePeriod"
>;

type ReviewRowSharedProps = ReviewRowHandlers & {
	row: ReviewRow;
	index: number;
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	cardOptions: SelectOption[];
};

function ReviewMobileList({
	rows,
	allSelected,
	someSelected,
	payerOptions,
	categoryOptions,
	cardOptions,
	onToggle,
	onToggleAll,
	...handlers
}: ReviewRowHandlers & {
	rows: ReviewRow[];
	allSelected: boolean;
	someSelected: boolean;
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	cardOptions: SelectOption[];
	onToggle: (index: number) => void;
	onToggleAll: (selected: boolean) => void;
}) {
	return (
		<div className="flex flex-col gap-2 p-2 md:hidden">
			<div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2">
				<Checkbox
					checked={allSelected}
					onCheckedChange={(value) => onToggleAll(!!value)}
					aria-label="Selecionar todas"
					data-state={
						!allSelected && someSelected ? "indeterminate" : undefined
					}
				/>
				<span className="text-muted-foreground text-sm">Selecionar todos</span>
			</div>

			{rows.map((row, index) => (
				<ReviewMobileCard
					key={row.externalId ?? `${row.date}-${index}`}
					row={row}
					index={index}
					payerOptions={payerOptions}
					categoryOptions={categoryOptions}
					cardOptions={cardOptions}
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
	payerOptions,
	categoryOptions,
	cardOptions,
	onToggle,
	onPayerChange,
	onCategoryChange,
	onCreateCategory,
	onRowTypeChange,
	onInvoicePaymentCardChange,
	onInvoicePaymentPeriodChange,
	onDescriptionChange,
	onInstallmentToggle,
	onInstallmentCountChange,
	onInstallmentCurrentChange,
	onUndoDuplicate,
	onEditDuplicate,
	onConvertToInstallment,
	onConvertToRecurrence,
	onRecurrenceToggle,
	onRecurrenceCountChange,
	isCard,
	invoicePeriod,
}: ReviewRowSharedProps & { onToggle: (index: number) => void }) {
	const categoryOptionsForRow = categoryOptions.filter(
		(option) =>
			option.group === categoryGroupByTransactionType[row.transactionType],
	);

	if (isVerifiedImportDuplicate(row)) {
		const existingPayerId = row.duplicateValidation?.existingPayerId ?? null;
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
						<MoneyValues
							amount={
								row.transactionType === "expense" ? -row.amount : row.amount
							}
							showPositiveSign={row.transactionType === "income"}
							className={cn(
								"shrink-0 text-sm font-medium",
								row.transactionType === "income"
									? "text-success"
									: "text-foreground",
							)}
						/>
					</div>
					<ReviewVerifiedDuplicateDescription
						row={row}
						index={index}
						onEditDuplicate={onEditDuplicate}
						onUndoDuplicate={onUndoDuplicate}
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

	return (
		<article
			className={cn(
				"rounded-lg border bg-card p-3 shadow-xs transition-colors",
				row.selected && "border-primary/40 ring-1 ring-primary/15",
				getDuplicateRowClassName(row),
			)}
		>
			<div className="space-y-3">
				<div className="flex items-center gap-2">
					<Checkbox
						checked={row.selected}
						onCheckedChange={() => onToggle(index)}
						aria-label={`Selecionar ${row.description}`}
						className="shrink-0"
					/>
					<p className="min-w-0 flex-1 text-muted-foreground text-xs">
						{formatDate(row.date)}
					</p>
					<MoneyValues
						amount={
							row.transactionType === "expense" ? -row.amount : row.amount
						}
						showPositiveSign={row.transactionType === "income"}
						className={cn(
							"shrink-0 text-sm font-medium",
							row.transactionType === "income"
								? "text-success"
								: "text-foreground",
						)}
					/>
				</div>

				<div className="space-y-2">
					<ReviewDescriptionField
						row={row}
						index={index}
						isCard={isCard}
						invoicePeriod={invoicePeriod}
						onDescriptionChange={onDescriptionChange}
						onUndoDuplicate={onUndoDuplicate}
						onConvertToInstallment={onConvertToInstallment}
						onConvertToRecurrence={onConvertToRecurrence}
						fullWidth
					/>
					<ReviewInstallmentFields
						row={row}
						index={index}
						isCard={isCard}
						invoicePeriod={invoicePeriod}
						onInstallmentToggle={onInstallmentToggle}
						onInstallmentCountChange={onInstallmentCountChange}
						onInstallmentCurrentChange={onInstallmentCurrentChange}
					/>
					<ReviewRecurrenceFields
						row={row}
						index={index}
						onRecurrenceToggle={onRecurrenceToggle}
						onRecurrenceCountChange={onRecurrenceCountChange}
					/>
					<ReviewDuplicateStatus
						row={row}
						index={index}
						onUndoDuplicate={onUndoDuplicate}
					/>
				</div>

				<div className="flex items-center gap-1.5">
					<ReviewRowKindSelect
						row={row}
						index={index}
						onRowTypeChange={onRowTypeChange}
						compact
					/>
					<ReviewPayerSelect
						row={row}
						index={index}
						payerOptions={payerOptions}
						onPayerChange={onPayerChange}
						compact
					/>
					{row.kind === "invoice_payment" ? (
						<ReviewInvoicePaymentFields
							row={row}
							index={index}
							cardOptions={cardOptions}
							onInvoicePaymentCardChange={onInvoicePaymentCardChange}
							onInvoicePaymentPeriodChange={onInvoicePaymentPeriodChange}
							compact
						/>
					) : (
						<ReviewCategorySelect
							row={row}
							index={index}
							categoryOptions={categoryOptionsForRow}
							onCategoryChange={onCategoryChange}
							onCreateCategory={onCreateCategory}
							compact
						/>
					)}
				</div>
			</div>
		</article>
	);
}

function ReviewInstallmentFields({
	row,
	index,
	isCard,
	invoicePeriod,
	onInstallmentToggle,
	onInstallmentCountChange,
	onInstallmentCurrentChange,
}: {
	row: ReviewRow;
	index: number;
	isCard: boolean;
	invoicePeriod: string | null;
	onInstallmentToggle: (index: number, enabled: boolean) => void;
	onInstallmentCountChange: (index: number, installmentCount: number) => void;
	onInstallmentCurrentChange: (index: number, currentInstallment: number) => void;
}) {
	const [expanded, setExpanded] = useState(false);

	if (
		!isCard ||
		!invoicePeriod ||
		row.kind !== "transaction" ||
		row.transactionType !== "expense" ||
		!row.installmentImport
	) {
		return null;
	}

	const installment = row.installmentImport;
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
			className="rounded-md border border-dashed border-border/70 bg-muted/20 p-3"
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
					onCheckedChange={(checked) => onInstallmentToggle(index, checked)}
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
						Este lançamento parece ser uma parcela de compra no cartão. Ative para
						importar o parcelamento completo.
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
}: {
	row: ReviewRow;
	index: number;
	onRecurrenceToggle: (index: number, enabled: boolean) => void;
	onRecurrenceCountChange: (index: number, recurrenceCount: number) => void;
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
			className="rounded-md border border-dashed border-border/70 bg-muted/20 p-3"
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
							<p className="truncate text-muted-foreground text-xs">{summary}</p>
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

function ReviewDescriptionField({
	row,
	index,
	isCard,
	invoicePeriod,
	onDescriptionChange,
	onUndoDuplicate,
	onConvertToInstallment,
	onConvertToRecurrence,
	fullWidth = false,
}: Pick<
	ReviewRowSharedProps,
	| "row"
	| "index"
	| "onDescriptionChange"
	| "onUndoDuplicate"
	| "onConvertToInstallment"
	| "onConvertToRecurrence"
	| "isCard"
	| "invoicePeriod"
> & { fullWidth?: boolean }) {
	const fieldClassName =
		"w-full bg-transparent text-sm outline-none focus:rounded focus:ring-1 focus:ring-ring";

	const canConvert =
		row.kind === "transaction" && !isVerifiedImportDuplicate(row);
	const canConvertToInstallment =
		canConvert &&
		isCard &&
		!!invoicePeriod &&
		row.transactionType === "expense" &&
		!row.recurrenceImport?.enabled &&
		!row.installmentImport?.enabled;
	const canConvertToRecurrence =
		canConvert && !row.installmentImport?.enabled;

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
		<div className="space-y-1">
			<div
				className={cn(
					"flex gap-1",
					fullWidth ? "items-start" : "items-center",
				)}
			>
				{convertActions}
				{fullWidth ? (
					<textarea
						value={row.description}
						onChange={(event) => onDescriptionChange(index, event.target.value)}
						rows={2}
						className={cn(
							fieldClassName,
							"min-h-10 min-w-0 flex-1 resize-none wrap-break-word leading-snug",
						)}
					/>
				) : (
					<input
						type="text"
						value={row.description}
						onChange={(event) => onDescriptionChange(index, event.target.value)}
						className={cn(fieldClassName, "min-w-0 flex-1")}
					/>
				)}
			</div>
			{row.kind === "invoice_payment" && (
				<Badge variant="outline" className="text-[10px]">
					Pagamento de fatura
				</Badge>
			)}
			<ReviewDuplicateStatus
				row={row}
				index={index}
				onUndoDuplicate={onUndoDuplicate}
			/>
		</div>
	);
}

function ReviewRowKindSelect({
	row,
	index,
	onRowTypeChange,
	fullWidth = false,
	compact = false,
}: {
	row: ReviewRow;
	index: number;
	onRowTypeChange: (
		index: number,
		type: "expense" | "income" | "invoice_payment",
	) => void;
	fullWidth?: boolean;
	compact?: boolean;
}) {
	const select = (
		<Select
			value={
				row.kind === "invoice_payment" ? "invoice_payment" : row.transactionType
			}
			onValueChange={(value) => {
				if (value === "invoice_payment") {
					onRowTypeChange(index, "invoice_payment");
					return;
				}
				onRowTypeChange(index, value as "expense" | "income");
			}}
		>
			<SelectTrigger
				className={cn(
					compact
						? cn(
								"size-8 shrink-0 p-0 [&>svg]:hidden",
								getReviewRowKindIconClassName(row),
							)
						: "h-8 text-xs",
					fullWidth && !compact && "w-full",
				)}
				aria-label={compact ? getReviewRowKindLabel(row) : undefined}
			>
				{compact ? (
					<span className="flex size-full items-center justify-center">
						{getReviewRowKindIcon(row)}
					</span>
				) : (
					<SelectValue />
				)}
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="expense">Despesa</SelectItem>
				<SelectItem value="income">Receita</SelectItem>
				<SelectItem value="invoice_payment">Pgto. fatura</SelectItem>
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
}: {
	row: ReviewRow;
	index: number;
	cardOptions: SelectOption[];
	onInvoicePaymentCardChange: (index: number, cardId: string | null) => void;
	onInvoicePaymentPeriodChange: (index: number, period: string | null) => void;
	fullWidth?: boolean;
	compact?: boolean;
}) {
	const selectedCard = cardOptions.find(
		(option) => option.value === row.invoicePaymentCardId,
	);

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
				<SelectTrigger className={cn("h-8 text-xs", compact && "min-w-0 flex-1")}>
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
				className={cn(
					"h-8 justify-start text-xs",
					compact ? "w-[5.5rem] shrink-0 px-2" : "w-full",
				)}
			/>
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
}: {
	row: ReviewRow;
	index: number;
	categoryOptions: SelectOption[];
	onCategoryChange: (index: number, categoryId: string | null) => void;
	onCreateCategory: (index: number) => void;
	fullWidth?: boolean;
	compact?: boolean;
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
			triggerClassName={cn(
				"h-8 text-xs",
				compact ? "min-w-0 flex-1" : fullWidth && "w-full",
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
}: {
	row: ReviewRow;
	index: number;
	payerOptions: SelectOption[];
	onPayerChange: (index: number, payerId: string | null) => void;
	fullWidth?: boolean;
	compact?: boolean;
}) {
	const payerOption = payerOptions.find(
		(option) => option.value === row.payerId,
	);

	const select = (
		<Select
			value={row.payerId ?? ""}
			onValueChange={(value) => onPayerChange(index, value || null)}
		>
			<SelectTrigger
				className={cn(
					"h-8 text-xs",
					compact
						? "size-8 shrink-0 px-1 [&>svg]:hidden"
						: fullWidth
							? "w-full"
							: "max-md:px-1.5 max-md:[&>svg]:hidden",
				)}
				aria-label={compact ? payerOption?.label ?? "Pessoa" : undefined}
			>
				<SelectValue placeholder={compact ? undefined : "Pessoa…"}>
					{payerOption ? (
						<PayerSelectTriggerValue
							label={payerOption.label}
							avatarUrl={payerOption.avatarUrl}
							showLabel={!compact && fullWidth}
						/>
					) : null}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{payerOptions.map((opt) => (
					<SelectItem key={opt.value} value={opt.value}>
						<PayerSelectContent
							label={opt.label}
							avatarUrl={opt.avatarUrl}
						/>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);

	if (!payerOption) {
		return (
			<div className={cn(compact ? "shrink-0" : fullWidth ? "w-full" : "w-fit")}>
				{select}
			</div>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn(compact ? "shrink-0" : fullWidth ? "w-full" : "w-fit")}>
					{select}
				</div>
			</TooltipTrigger>
			<TooltipContent className={compact || fullWidth ? undefined : "md:hidden"}>
				{payerOption.label}
			</TooltipContent>
		</Tooltip>
	);
}
