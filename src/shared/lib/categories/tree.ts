export type CategoryTreeItem = {
	id: string;
	name: string;
	parentId: string | null;
	type?: string;
	sortOrder?: number;
};

export type CategoryTreeNode<T extends CategoryTreeItem> = T & {
	children: CategoryTreeNode<T>[];
};

export function buildCategoryTree<T extends CategoryTreeItem>(
	items: T[],
): CategoryTreeNode<T>[] {
	const nodes = new Map<string, CategoryTreeNode<T>>();

	for (const item of items) {
		nodes.set(item.id, { ...item, children: [] });
	}

	const roots: CategoryTreeNode<T>[] = [];

	for (const item of items) {
		const node = nodes.get(item.id);
		if (!node) {
			continue;
		}

		if (item.parentId && nodes.has(item.parentId)) {
			nodes.get(item.parentId)?.children.push(node);
			continue;
		}

		roots.push(node);
	}

	const sortNodes = (treeNodes: CategoryTreeNode<T>[]) => {
		treeNodes.sort((left, right) => {
			const orderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
			if (orderDiff !== 0) {
				return orderDiff;
			}

			return left.name.localeCompare(right.name, "pt-BR", {
				sensitivity: "base",
			});
		});

		for (const node of treeNodes) {
			sortNodes(node.children);
		}
	};

	sortNodes(roots);

	return roots;
}

export function flattenCategoryTree<T extends CategoryTreeItem>(
	roots: CategoryTreeNode<T>[],
): Array<T & { depth: number }> {
	const flattened: Array<T & { depth: number }> = [];

	const walk = (treeNodes: CategoryTreeNode<T>[], depth: number) => {
		for (const node of treeNodes) {
			const { children, ...rest } = node;
			flattened.push({ ...(rest as unknown as T), depth });
			walk(children, depth + 1);
		}
	};

	walk(roots, 0);

	return flattened;
}

export function getCategoryDescendantIds(
	categoryId: string,
	items: Array<{ id: string; parentId: string | null }>,
): Set<string> {
	const childrenByParent = new Map<string, string[]>();

	for (const item of items) {
		if (!item.parentId) {
			continue;
		}

		const siblings = childrenByParent.get(item.parentId) ?? [];
		siblings.push(item.id);
		childrenByParent.set(item.parentId, siblings);
	}

	const descendants = new Set<string>();
	const stack = [...(childrenByParent.get(categoryId) ?? [])];

	while (stack.length > 0) {
		const currentId = stack.pop();
		if (!currentId || descendants.has(currentId)) {
			continue;
		}

		descendants.add(currentId);
		stack.push(...(childrenByParent.get(currentId) ?? []));
	}

	return descendants;
}

export function getCategoryPathLabel(
	categoryId: string,
	categoriesById: Map<string, { name: string; parentId: string | null }>,
	separator = " › ",
): string {
	const parts: string[] = [];
	let currentId: string | null = categoryId;
	const visited = new Set<string>();

	while (currentId) {
		if (visited.has(currentId)) {
			break;
		}

		visited.add(currentId);
		const current = categoriesById.get(currentId);
		if (!current) {
			break;
		}

		parts.unshift(current.name);
		currentId = current.parentId;
	}

	return parts.join(separator);
}

export function getCategoryAncestorPathLabel(
	categoryId: string,
	categoriesById: Map<string, { name: string; parentId: string | null }>,
	separator = " › ",
): string | null {
	const path = getCategoryPathLabel(categoryId, categoriesById, separator);
	const parts = path.split(separator);

	if (parts.length <= 1) {
		return null;
	}

	return parts.slice(0, -1).join(separator);
}

export function isValidCategoryParent(
	categoryId: string | null,
	parentId: string | null,
	items: Array<{ id: string; parentId: string | null; type: string }>,
	categoryType: string,
): boolean {
	if (!parentId) {
		return true;
	}

	const parent = items.find((item) => item.id === parentId);
	if (!parent) {
		return false;
	}

	if (parent.type !== categoryType) {
		return false;
	}

	if (categoryId && parentId === categoryId) {
		return false;
	}

	if (categoryId) {
		const descendants = getCategoryDescendantIds(categoryId, items);
		if (descendants.has(parentId)) {
			return false;
		}
	}

	return true;
}

export function formatIndentedCategoryLabel(
	name: string,
	depth: number,
): string {
	if (depth <= 0) {
		return name;
	}

	return `${"— ".repeat(depth)}${name}`;
}
