"use client";

import { RiAddFill } from "@remixicon/react";
import { useMemo, useState } from "react";
import { CategoriesSortableTable } from "@/features/categories/components/categories-sortable-table";
import { DeleteCategoryDialog } from "@/features/categories/components/delete-category-dialog";
import { Button } from "@/shared/components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import {
	CATEGORY_TYPE_LABEL,
	CATEGORY_TYPES,
	type CategoryType,
} from "@/shared/lib/categories/constants";
import { CategoryDialog } from "./category-dialog";
import type { Category } from "./types";

interface CategoriesPageProps {
	categories: Category[];
}

export function CategoriesPage({ categories }: CategoriesPageProps) {
	const [activeType, setActiveType] = useState<CategoryType>(CATEGORY_TYPES[0]);
	const [editOpen, setEditOpen] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		null,
	);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [categoryToRemove, setCategoryToRemove] = useState<Category | null>(
		null,
	);
	const [createParentId, setCreateParentId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);

	const categoriesByType = useMemo(() => {
		const base = Object.fromEntries(
			CATEGORY_TYPES.map((type) => [type, [] as Category[]]),
		) as Record<CategoryType, Category[]>;

		categories.forEach((category) => {
			base[category.type]?.push(category);
		});

		return base;
	}, [categories]);

	const categoriesById = useMemo(
		() =>
			new Map(
				categories.map((category) => [
					category.id,
					{ name: category.name, parentId: category.parentId },
				]),
			),
		[categories],
	);

	const handleEdit = (category: Category) => {
		setSelectedCategory(category);
		setEditOpen(true);
	};

	const handleEditOpenChange = (open: boolean) => {
		setEditOpen(open);
		if (!open) {
			setSelectedCategory(null);
		}
	};

	const handleCreateSubcategory = (category: Category) => {
		setCreateParentId(category.id);
		setCreateOpen(true);
	};

	const handleCreateOpenChange = (open: boolean) => {
		setCreateOpen(open);
		if (!open) {
			setCreateParentId(null);
		}
	};

	const handleRemoveRequest = (category: Category) => {
		setCategoryToRemove(category);
		setRemoveOpen(true);
	};

	const handleRemoveOpenChange = (open: boolean) => {
		setRemoveOpen(open);
		if (!open) {
			setCategoryToRemove(null);
		}
	};

	return (
		<>
			<div className="flex w-full flex-col gap-6">
				<div className="flex">
					<CategoryDialog
						mode="create"
						defaultType={activeType}
						allCategories={categories}
						trigger={
							<Button className="w-full sm:w-auto">
								<RiAddFill className="size-4" />
								Nova categoria
							</Button>
						}
					/>
				</div>

				<Tabs
					value={activeType}
					onValueChange={(value) => setActiveType(value as CategoryType)}
					className="w-full"
				>
					<TabsList>
						{CATEGORY_TYPES.map((type) => (
							<TabsTrigger key={type} value={type}>
								{CATEGORY_TYPE_LABEL[type]}
							</TabsTrigger>
						))}
					</TabsList>

					{CATEGORY_TYPES.map((type) => (
						<TabsContent key={type} value={type} className="mt-4">
							{categoriesByType[type].length === 0 ? (
								<div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed bg-muted/10 p-10 text-center text-sm text-muted-foreground">
									Ainda não há categorias de{" "}
									{CATEGORY_TYPE_LABEL[type].toLowerCase()}.
								</div>
							) : (
								<CategoriesSortableTable
									type={type}
									categories={categoriesByType[type]}
									categoriesById={categoriesById}
									onEdit={handleEdit}
									onCreateSubcategory={handleCreateSubcategory}
									onRemoveRequest={handleRemoveRequest}
								/>
							)}
						</TabsContent>
					))}
				</Tabs>
			</div>

			<CategoryDialog
				mode="create"
				defaultType={activeType}
				defaultParentId={createParentId}
				allCategories={categories}
				open={createOpen}
				onOpenChange={handleCreateOpenChange}
			/>

			<CategoryDialog
				mode="update"
				category={selectedCategory ?? undefined}
				allCategories={categories}
				open={editOpen && !!selectedCategory}
				onOpenChange={handleEditOpenChange}
			/>

			<DeleteCategoryDialog
				category={categoryToRemove}
				allCategories={categories}
				open={removeOpen && !!categoryToRemove}
				onOpenChange={handleRemoveOpenChange}
			/>
		</>
	);
}
