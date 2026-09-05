import type { CategoryBudgetSummary } from "@/features/budgets/queries";
import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export type BudgetPayload = {
	categoryId: string;
	period: string;
	amount: string;
};

export async function createBudgetClient(
	input: BudgetPayload,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/budgets",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível criar o orçamento.",
	);
}

export async function updateBudgetClient(
	budgetId: string,
	input: BudgetPayload,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/budgets/${budgetId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar o orçamento.",
	);
}

export async function deleteBudgetClient(
	budgetId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/budgets/${budgetId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover o orçamento.",
	);
}

export async function duplicatePreviousMonthBudgetsClient(input: {
	period: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/budgets/duplicate-previous-month",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível duplicar os orçamentos.",
	);
}

export async function getCategoryBudgetSummaryClient(input: {
	categoryId: string;
	period: string;
}): Promise<ActionResult<CategoryBudgetSummary | null>> {
	const params = new URLSearchParams(input);
	return fetchActionResult(
		`/api/budgets/category-summary?${params.toString()}`,
		undefined,
		"Não foi possível carregar o orçamento da categoria.",
	);
}
