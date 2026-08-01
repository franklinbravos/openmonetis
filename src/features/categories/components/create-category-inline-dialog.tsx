"use client";

import type { CreatedCategory } from "@/features/categories/components/category-dialog";
import { CategoryDialog } from "@/features/categories/components/category-dialog";
import type { Category } from "@/features/categories/components/types";
import type { CategoryType } from "@/shared/lib/categories/constants";

export type { CreatedCategory };

interface CreateCategoryInlineDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (category: CreatedCategory) => void;
	allCategories: Category[];
	defaultType: CategoryType;
	defaultParentId?: string | null;
}

export function CreateCategoryInlineDialog({
	open,
	onOpenChange,
	onCreated,
	allCategories,
	defaultType,
	defaultParentId,
}: CreateCategoryInlineDialogProps) {
	return (
		<CategoryDialog
			mode="create"
			open={open}
			onOpenChange={onOpenChange}
			allCategories={allCategories}
			defaultType={defaultType}
			defaultParentId={defaultParentId}
			onCreated={onCreated}
		/>
	);
}
