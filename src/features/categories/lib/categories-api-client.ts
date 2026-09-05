import type { CategoryFormValues } from "@/features/categories/components/types";
import type { CategoryLinkedTransaction } from "@/features/categories/queries";
import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export type CategoryCreatePayload = {
	name: string;
	type: CategoryFormValues["type"];
	icon: string | null;
	parentId: string | null;
};

export type CreatedCategoryResult = {
	id: string;
	name: string;
	type: CategoryFormValues["type"];
	icon: string | null;
	parentId: string | null;
};

export async function createCategoryClient(
	input: CategoryCreatePayload,
): Promise<ActionResult<CreatedCategoryResult>> {
	return fetchActionResult(
		"/api/categories",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível criar a categoria.",
	);
}

export async function updateCategoryClient(
	categoryId: string,
	input: CategoryCreatePayload,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/categories/${categoryId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a categoria.",
	);
}

export async function deleteCategoryClient(
	categoryId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/categories/${categoryId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover a categoria.",
	);
}

export async function fetchCategoryLinkedTransactionsClient(
	categoryId: string,
): Promise<ActionResult<CategoryLinkedTransaction[]>> {
	return fetchActionResult(
		`/api/categories/${categoryId}`,
		undefined,
		"Não foi possível carregar os lançamentos vinculados.",
	);
}

export async function migrateCategoryTransactionsClient(input: {
	fromCategoryId: string;
	toCategoryId: string;
	transactionIds?: string[];
}): Promise<ActionResult<{ updatedCount: number }>> {
	return fetchActionResult(
		"/api/categories/migrate-transactions",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível migrar os lançamentos.",
	);
}

export async function updateCategoryTransactionCategoryClient(
	transactionId: string,
	input: { categoryId: string },
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/categories/transactions/${transactionId}/category`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a categoria do lançamento.",
	);
}

export async function reorderCategoriesClient(input: {
	type: string;
	categories: Array<{
		id: string;
		parentId: string | null;
		sortOrder: number;
	}>;
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/categories/reorder",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível reordenar as categorias.",
	);
}
