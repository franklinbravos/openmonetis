import type { SelectOption } from "@/features/transactions/components/types";
import {
	CATEGORY_TYPE_LABEL,
	type CategoryType,
} from "@/shared/lib/categories/constants";
import {
	buildCategoryTree,
	flattenCategoryTree,
	getCategoryPathLabel,
} from "@/shared/lib/categories/tree";
import type { Category } from "../components/types";

type BuildCategorySelectOptionsParams = {
	categories: Category[];
	excludeCategoryId?: string;
	typeFilter?: CategoryType;
};

export function resolveCategoryTypeForTransaction(
	transactionType: string,
): CategoryType {
	return transactionType.toLowerCase() === "receita" ? "receita" : "despesa";
}

export function buildCategorySelectOptions({
	categories,
	excludeCategoryId,
	typeFilter,
}: BuildCategorySelectOptionsParams): SelectOption[] {
	const filtered = categories.filter((category) => {
		if (excludeCategoryId && category.id === excludeCategoryId) {
			return false;
		}
		if (typeFilter && category.type !== typeFilter) {
			return false;
		}
		return true;
	});

	const categoriesById = new Map(
		filtered.map((category) => [
			category.id,
			{ name: category.name, parentId: category.parentId },
		]),
	);

	const flattened = flattenCategoryTree(
		buildCategoryTree(
			filtered.map((category) => ({
				id: category.id,
				name: category.name,
				parentId: category.parentId,
				type: category.type,
				sortOrder: category.sortOrder ?? 0,
				icon: category.icon,
			})),
		),
	);

	return flattened.map((category) => ({
		value: category.id,
		label: category.name,
		group: CATEGORY_TYPE_LABEL[category.type as CategoryType],
		icon: category.icon,
		parentId: category.parentId,
		categoryPath:
			getCategoryPathLabel(category.id, categoriesById) ?? category.name,
		categoryDepth: category.depth,
	}));
}
