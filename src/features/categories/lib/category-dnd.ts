import type { CategoryType } from "@/shared/lib/categories/constants";
import {
	type CategoryTreeItem,
	getCategoryAncestorPathLabel,
	getCategoryDescendantIds,
} from "@/shared/lib/categories/tree";

export type CategoryDropPosition = "before" | "inside" | "after";

export type FlatCategoryItem = CategoryTreeItem & {
	depth: number;
	ancestorPath: string | null;
	icon: string | null;
	type: CategoryType;
};

export type CategoryOrderUpdate = {
	id: string;
	parentId: string | null;
	sortOrder: number;
};

export function resolveCategoryDropPosition(
	pointerY: number,
	overRect: { top: number; height: number },
): CategoryDropPosition {
	const relativeY = pointerY - overRect.top;
	const ratio = overRect.height > 0 ? relativeY / overRect.height : 0.5;

	if (ratio < 0.25) {
		return "before";
	}

	if (ratio > 0.75) {
		return "after";
	}

	return "inside";
}

function findLastDescendantIndex(
	items: FlatCategoryItem[],
	parentId: string,
): number {
	const parentIndex = items.findIndex((item) => item.id === parentId);
	if (parentIndex === -1) {
		return -1;
	}

	const parentDepth = items[parentIndex].depth;
	let lastIndex = parentIndex;

	for (let index = parentIndex + 1; index < items.length; index++) {
		if (items[index].depth <= parentDepth) {
			break;
		}

		lastIndex = index;
	}

	return lastIndex;
}

export function isCategoryDescendant(
	categoryId: string,
	possibleDescendantId: string,
	items: Array<{ id: string; parentId: string | null }>,
): boolean {
	return getCategoryDescendantIds(categoryId, items).has(possibleDescendantId);
}

export function applyCategoryDrop({
	items,
	activeId,
	overId,
	position,
}: {
	items: FlatCategoryItem[];
	activeId: string;
	overId: string;
	position: CategoryDropPosition;
}): FlatCategoryItem[] | null {
	if (activeId === overId) {
		return null;
	}

	const activeItem = items.find((item) => item.id === activeId);
	if (!activeItem) {
		return null;
	}

	const withoutActive = items.filter((item) => item.id !== activeId);
	const overIndex = withoutActive.findIndex((item) => item.id === overId);
	if (overIndex === -1) {
		return null;
	}

	const overItem = withoutActive[overIndex];
	let newParentId: string | null;
	let insertIndex: number;

	if (position === "inside") {
		if (isCategoryDescendant(activeId, overId, items)) {
			return null;
		}

		newParentId = overId;
		const lastDescendantIndex = findLastDescendantIndex(withoutActive, overId);
		insertIndex =
			lastDescendantIndex === -1 ? overIndex + 1 : lastDescendantIndex + 1;
	} else if (position === "before") {
		newParentId = overItem.parentId;
		insertIndex = overIndex;
	} else {
		newParentId = overItem.parentId;
		const lastDescendantIndex = findLastDescendantIndex(withoutActive, overId);
		insertIndex =
			lastDescendantIndex === -1 ? overIndex + 1 : lastDescendantIndex + 1;
	}

	if (newParentId && isCategoryDescendant(activeId, newParentId, items)) {
		return null;
	}

	const nextItems = [...withoutActive];
	nextItems.splice(insertIndex, 0, {
		...activeItem,
		parentId: newParentId,
	});

	return recalculateFlatCategoryDepths(nextItems);
}

export function recalculateFlatCategoryDepths(
	items: FlatCategoryItem[],
): FlatCategoryItem[] {
	const depthById = new Map<string, number>();

	return items.map((item) => {
		const depth = item.parentId ? (depthById.get(item.parentId) ?? -1) + 1 : 0;
		depthById.set(item.id, depth);

		return {
			...item,
			depth,
		};
	});
}

function buildCategoriesByIdFromFlat(
	items: Array<{ id: string; name: string; parentId: string | null }>,
) {
	return new Map(
		items.map((item) => [
			item.id,
			{ name: item.name, parentId: item.parentId },
		]),
	);
}

export function enrichFlatCategories(
	items: FlatCategoryItem[],
): FlatCategoryItem[] {
	const withDepth = recalculateFlatCategoryDepths(items);
	const categoriesById = buildCategoriesByIdFromFlat(withDepth);

	return withDepth.map((item) => ({
		...item,
		ancestorPath: getCategoryAncestorPathLabel(item.id, categoriesById),
	}));
}

export function buildCategoryOrderUpdates(
	items: Array<{ id: string; parentId: string | null }>,
): CategoryOrderUpdate[] {
	const siblingCounters = new Map<string | null, number>();

	return items.map((item) => {
		const sortOrder = siblingCounters.get(item.parentId) ?? 0;
		siblingCounters.set(item.parentId, sortOrder + 1);

		return {
			id: item.id,
			parentId: item.parentId,
			sortOrder,
		};
	});
}
