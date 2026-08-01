"use client";

import { RiAddFill } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { getCategoryBudgetSummaryAction } from "@/features/budgets/actions";
import type { CategoryBudgetSummary } from "@/features/budgets/queries";
import { TRANSACTION_TYPES } from "@/features/transactions/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";
import {
	CategorySelectContent,
	TransactionTypeSelectContent,
} from "../../select-items";
import type { CategorySectionProps } from "./transaction-dialog-types";

const BUDGET_DANGER_RATIO = 1;
const BUDGET_WARNING_RATIO = 0.8;

const getBudgetTone = (ratio: number) => {
	if (ratio >= BUDGET_DANGER_RATIO) return "text-red-600 dark:text-red-400";
	if (ratio >= BUDGET_WARNING_RATIO)
		return "text-amber-600 dark:text-amber-400";
	return "text-emerald-600 dark:text-emerald-400";
};

const formatCompactCurrency = (value: number) =>
	formatCurrency(value, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});

function SelectFieldHeader({
	htmlFor,
	label,
	actionLabel,
	onAction,
}: {
	htmlFor: string;
	label: string;
	actionLabel?: string;
	onAction?: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<Label htmlFor={htmlFor}>{label}</Label>
			{onAction ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
					aria-label={actionLabel}
					onClick={onAction}
				>
					<RiAddFill className="size-4" />
				</Button>
			) : null}
		</div>
	);
}

function SelectCreateAction({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<>
			<SelectSeparator />
			<div className="p-1">
				<button
					type="button"
					className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-primary text-sm hover:bg-accent"
					onClick={onClick}
				>
					<RiAddFill className="size-4" />
					{label}
				</button>
			</div>
		</>
	);
}

export function CategorySection({
	formState,
	onFieldChange,
	categoryOptions,
	categoryGroups,
	isUpdateMode,
	hideTransactionType = false,
	onCreateCategory,
}: CategorySectionProps) {
	const showTransactionTypeField = !isUpdateMode && !hideTransactionType;
	const [categorySelectOpen, setCategorySelectOpen] = useState(false);

	const [budgetSummary, setBudgetSummary] =
		useState<CategoryBudgetSummary | null>(null);
	const cacheRef = useRef<Map<string, CategoryBudgetSummary | null>>(new Map());

	const { categoryId, period, transactionType } = formState;
	const shouldFetchBudget =
		Boolean(categoryId) && Boolean(period) && transactionType === "Despesa";

	useEffect(() => {
		if (!shouldFetchBudget || !categoryId || !period) {
			setBudgetSummary(null);
			return;
		}

		const key = `${categoryId}::${period}`;
		const cached = cacheRef.current.get(key);
		if (cached !== undefined) {
			setBudgetSummary((prev) => (prev === cached ? prev : cached));
			return;
		}

		let cancelled = false;
		getCategoryBudgetSummaryAction({ categoryId, period }).then((result) => {
			if (cancelled) return;
			const data = result.success ? (result.data ?? null) : null;
			cacheRef.current.set(key, data);
			setBudgetSummary(data);
		});

		return () => {
			cancelled = true;
		};
	}, [shouldFetchBudget, categoryId, period]);

	const renderBudgetBadge = () => {
		if (showTransactionTypeField) return null;
		if (!shouldFetchBudget || !budgetSummary) return null;

		const { amount, spent } = budgetSummary;
		const ratio = amount > 0 ? spent / amount : 0;
		const percent = amount > 0 ? Math.round(ratio * 100) : 0;

		return (
			<span
				title={`${formatCurrency(spent)} de ${formatCurrency(amount)} (${percent}%)`}
				className={cn(
					"shrink-0 font-mono font-semibold text-xs leading-none whitespace-nowrap",
					getBudgetTone(ratio),
				)}
			>
				{formatCompactCurrency(spent)} de {formatCompactCurrency(amount)}
				<span className="ml-1 opacity-70">({percent}%)</span>
			</span>
		);
	};

	const handleCreateCategory = () => {
		setCategorySelectOpen(false);
		onCreateCategory?.();
	};

	return (
		<div className="flex w-full flex-col gap-2 md:flex-row">
			{showTransactionTypeField ? (
				<div className="w-full space-y-1 md:w-1/2">
					<Label htmlFor="transactionType">Tipo de transação</Label>
					<Select
						value={formState.transactionType}
						onValueChange={(value) => onFieldChange("transactionType", value)}
					>
						<SelectTrigger id="transactionType" className="w-full">
							<SelectValue placeholder="Selecione">
								{formState.transactionType && (
									<TransactionTypeSelectContent
										label={formState.transactionType}
									/>
								)}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{TRANSACTION_TYPES.filter((type) => type !== "Transferência").map(
								(type) => (
									<SelectItem key={type} value={type}>
										<TransactionTypeSelectContent label={type} />
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>
				</div>
			) : null}

			<div
				className={cn(
					"space-y-1 w-full",
					showTransactionTypeField ? "md:w-1/2" : "md:w-full",
				)}
			>
				<SelectFieldHeader
					htmlFor="categoria"
					label="Categoria"
					actionLabel="Nova categoria"
					onAction={onCreateCategory ? handleCreateCategory : undefined}
				/>
				<Select
					open={categorySelectOpen}
					onOpenChange={setCategorySelectOpen}
					value={formState.categoryId ?? ""}
					onValueChange={(value) => onFieldChange("categoryId", value)}
				>
					<SelectTrigger id="categoria" className="w-full">
						<SelectValue placeholder="Selecione">
							{formState.categoryId &&
								(() => {
									const selectedOption = categoryOptions.find(
										(opt) => opt.value === formState.categoryId,
									);
									if (!selectedOption) return null;
									return (
										<span className="flex items-center gap-2">
											<CategorySelectContent
												label={selectedOption.label}
												icon={selectedOption.icon}
												depth={selectedOption.categoryDepth}
												pathLabel={selectedOption.categoryPath}
											/>
											{renderBudgetBadge()}
										</span>
									);
								})()}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{categoryGroups.map((group) => (
							<SelectGroup key={group.label}>
								<SelectLabel>{group.label}</SelectLabel>
								{group.options.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<CategorySelectContent
											label={option.label}
											icon={option.icon}
											depth={option.categoryDepth}
											pathLabel={option.categoryPath}
										/>
									</SelectItem>
								))}
							</SelectGroup>
						))}
						{onCreateCategory ? (
							<SelectCreateAction
								label="Nova categoria"
								onClick={handleCreateCategory}
							/>
						) : null}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
