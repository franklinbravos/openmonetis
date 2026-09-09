"use client";

import { useEffect, useRef, useState } from "react";
import { getCategoryBudgetSummaryClient } from "@/features/budgets/lib/budgets-api-client";
import type { CategoryBudgetSummary } from "@/features/budgets/queries";
import { CategorySearchSelect } from "@/features/transactions/components/category-search-select";
import { TRANSACTION_TYPES } from "@/features/transactions/lib/constants";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";
import { TransactionTypeSelectContent } from "../../select-items";
import { SelectFieldHeader } from "./select-field-header";
import type { CategorySectionProps } from "./transaction-dialog-types";

const BUDGET_DANGER_RATIO = 1;
const BUDGET_WARNING_RATIO = 0.8;

const getBudgetTone = (ratio: number) => {
	if (ratio >= BUDGET_DANGER_RATIO) return "text-destructive";
	if (ratio >= BUDGET_WARNING_RATIO) return "text-warning";
	return "text-positive";
};

const formatCompactCurrency = (value: number) =>
	formatCurrency(value, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});

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
		getCategoryBudgetSummaryClient({ categoryId, period }).then((result) => {
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
					<SelectFieldHeader
						htmlFor="transactionType"
						label="Tipo de transação"
					/>
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
				<CategorySearchSelect
					id="categoria"
					open={categorySelectOpen}
					onOpenChange={setCategorySelectOpen}
					value={formState.categoryId ?? ""}
					onValueChange={(value) => onFieldChange("categoryId", value)}
					categoryGroups={categoryGroups}
					categoryOptions={categoryOptions}
					triggerExtra={renderBudgetBadge()}
					onCreateCategory={onCreateCategory ? handleCreateCategory : undefined}
				/>
			</div>
		</div>
	);
}
