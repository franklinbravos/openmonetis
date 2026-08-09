"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	RiAddLine,
	RiDeleteBin5Line,
	RiDraggable,
	RiMore2Line,
	RiPencilLine,
} from "@remixicon/react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { reorderCategoriesAction } from "@/features/categories/actions";
import { CategoryHierarchyName } from "@/features/categories/components/category-hierarchy-name";
import type { Category } from "@/features/categories/components/types";
import {
	applyCategoryDrop,
	buildCategoryOrderUpdates,
	type CategoryDropPosition,
	enrichFlatCategories,
	type FlatCategoryItem,
	resolveCategoryDropPosition,
} from "@/features/categories/lib/category-dnd";
import { CategoryIconBadge } from "@/shared/components/entity-avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import type { CategoryType } from "@/shared/lib/categories/constants";
import {
	buildCategoryTree,
	flattenCategoryTree,
	getCategoryAncestorPathLabel,
} from "@/shared/lib/categories/tree";
import { cn } from "@/shared/utils/ui";

const CATEGORIAS_PROTEGIDAS = [
	"Transferência interna",
	"Saldo inicial",
	"Pagamentos",
];

type DropIndicator = {
	overId: string;
	position: CategoryDropPosition;
};

type CategoriesSortableTableProps = {
	type: CategoryType;
	categories: Category[];
	categoriesById: Map<string, { name: string; parentId: string | null }>;
	onEdit: (category: Category) => void;
	onCreateSubcategory: (category: Category) => void;
	onRemoveRequest: (category: Category) => void;
};

function buildFlatCategories(
	categories: Category[],
	categoriesById: Map<string, { name: string; parentId: string | null }>,
): FlatCategoryItem[] {
	return flattenCategoryTree(buildCategoryTree(categories)).map((category) => {
		const source = categories.find((item) => item.id === category.id);

		return {
			...category,
			type: source?.type ?? "despesa",
			icon: source?.icon ?? null,
			ancestorPath: getCategoryAncestorPathLabel(category.id, categoriesById),
		};
	});
}

function hasGroupSeparatorBelow(
	items: FlatCategoryItem[],
	index: number,
): boolean {
	const next = items[index + 1];
	return Boolean(next && next.depth === 0);
}

function SortableCategoryRow({
	category,
	dropIndicator,
	showGroupSeparator,
	onEdit,
	onCreateSubcategory,
	onRemoveRequest,
}: {
	category: FlatCategoryItem;
	dropIndicator: DropIndicator | null;
	showGroupSeparator: boolean;
	onEdit: (category: Category) => void;
	onCreateSubcategory: (category: Category) => void;
	onRemoveRequest: (category: Category) => void;
}) {
	const isRoot = category.depth === 0;
	const isSubcategory = category.depth > 0;
	const isProtegida = CATEGORIAS_PROTEGIDAS.includes(category.name);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: category.id,
		disabled: isProtegida,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const showBefore =
		dropIndicator?.overId === category.id &&
		dropIndicator.position === "before";
	const showInside =
		dropIndicator?.overId === category.id &&
		dropIndicator.position === "inside";
	const showAfter =
		dropIndicator?.overId === category.id && dropIndicator.position === "after";

	return (
		<TableRow
			ref={setNodeRef}
			style={style}
			id={`category-row-${category.id}`}
			className={cn(
				isRoot && "bg-card",
				isSubcategory && "bg-muted/35",
				isSubcategory && "shadow-[inset_3px_0_0_0] shadow-primary/30",
				showGroupSeparator && "border-b-2 border-border/80",
				isDragging && "z-10 opacity-80 shadow-md",
				showInside && "bg-primary/5 ring-2 ring-inset ring-primary/40",
			)}
		>
			<TableCell className="w-10 align-top">
				<div
					className="pt-0.5"
					style={{
						paddingLeft: isSubcategory
							? `${category.depth * 1.5}rem`
							: undefined,
					}}
				>
					{isProtegida ? (
						<span className="inline-block size-8" aria-hidden />
					) : (
						<button
							type="button"
							className="flex size-8 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
							aria-label={`Arrastar ${category.name}`}
							{...attributes}
							{...listeners}
						>
							<RiDraggable className="size-4" aria-hidden />
						</button>
					)}
				</div>
			</TableCell>
			<TableCell className="min-w-[220px] align-top">
				<div className="relative py-0.5">
					{showBefore ? (
						<span
							className="absolute -top-1 right-0 left-0 h-0.5 rounded-full bg-primary"
							aria-hidden
						/>
					) : null}
					<div
						className="flex items-start gap-3"
						style={{
							paddingLeft: isSubcategory
								? `${category.depth * 1.5}rem`
								: undefined,
						}}
					>
						{isSubcategory ? (
							<span className="relative mt-2 flex h-8 w-5 shrink-0" aria-hidden>
								<span className="absolute top-0 bottom-1/2 left-2 border-muted-foreground/35 border-l" />
								<span className="absolute top-1/2 left-2 h-px w-3 bg-muted-foreground/35" />
							</span>
						) : null}
						<CategoryIconBadge
							icon={category.icon}
							name={category.name}
							size={isSubcategory ? "sm" : "md"}
						/>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<CategoryHierarchyName
									name={category.name}
									href={`/categories/${category.id}`}
									depth={category.depth}
									ancestorPath={category.ancestorPath}
								/>
								{isRoot ? (
									<Badge
										variant="outline"
										className="h-5 border-border/70 px-1.5 text-[10px] text-muted-foreground"
									>
										Raiz
									</Badge>
								) : (
									<Badge
										variant="secondary"
										className="h-5 px-1.5 text-[10px] text-muted-foreground"
									>
										Subcategoria
									</Badge>
								)}
							</div>
							{showInside ? (
								<p className="text-primary text-xs">
									Soltar para criar subcategoria
								</p>
							) : null}
						</div>
					</div>
					{showAfter ? (
						<span
							className="absolute right-0 -bottom-1 left-0 h-0.5 rounded-full bg-primary"
							aria-hidden
						/>
					) : null}
				</div>
			</TableCell>
			<TableCell className="align-top">
				{!isProtegida ? (
					<>
						<div className="flex justify-end md:hidden">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-8"
										aria-label={`Ações de ${category.name}`}
									>
										<RiMore2Line className="size-4" aria-hidden />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => onCreateSubcategory(category)}
									>
										<RiAddLine className="size-4" aria-hidden />
										categoria
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => onEdit(category)}>
										<RiPencilLine className="size-4" aria-hidden />
										editar
									</DropdownMenuItem>
									<DropdownMenuItem
										variant="destructive"
										onClick={() => onRemoveRequest(category)}
									>
										<RiDeleteBin5Line className="size-4" aria-hidden />
										remover
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						<div className="hidden items-center justify-end gap-3 pt-0.5 text-sm md:flex">
							<button
								type="button"
								onClick={() => onCreateSubcategory(category)}
								className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-opacity hover:text-primary hover:opacity-80"
							>
								<RiAddLine className="size-4 shrink-0" aria-hidden />
								<span>categoria</span>
							</button>
							<button
								type="button"
								onClick={() => onEdit(category)}
								className="flex items-center gap-1 font-medium text-primary transition-opacity hover:opacity-80"
							>
								<RiPencilLine className="size-4" aria-hidden />
								editar
							</button>
							<button
								type="button"
								onClick={() => onRemoveRequest(category)}
								className="flex items-center gap-1 font-medium text-destructive transition-opacity hover:opacity-80"
							>
								<RiDeleteBin5Line className="size-4" aria-hidden />
								remover
							</button>
						</div>
					</>
				) : null}
			</TableCell>
		</TableRow>
	);
}

export function CategoriesSortableTable({
	type,
	categories,
	categoriesById,
	onEdit,
	onCreateSubcategory,
	onRemoveRequest,
}: CategoriesSortableTableProps) {
	const [items, setItems] = useState<FlatCategoryItem[]>(() =>
		buildFlatCategories(categories, categoriesById),
	);
	const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
		null,
	);
	const [pointerY, setPointerY] = useState(0);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		setItems(buildFlatCategories(categories, categoriesById));
	}, [categories, categoriesById]);

	const itemIds = useMemo(() => items.map((item) => item.id), [items]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 6,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const getPointerY = (event: DragOverEvent | DragEndEvent) => {
		if (event.activatorEvent instanceof PointerEvent) {
			return event.activatorEvent.clientY + event.delta.y;
		}

		if (event.activatorEvent instanceof TouchEvent) {
			const touch = event.activatorEvent.changedTouches[0];
			if (touch) {
				return touch.clientY + event.delta.y;
			}
		}

		return pointerY;
	};

	const handleDragOver = (event: DragOverEvent) => {
		const currentPointerY = getPointerY(event);
		setPointerY(currentPointerY);

		const { active, over } = event;
		if (!over || active.id === over.id) {
			setDropIndicator(null);
			return;
		}

		const overRect = over.rect;
		if (!overRect) {
			setDropIndicator(null);
			return;
		}

		setDropIndicator({
			overId: String(over.id),
			position: resolveCategoryDropPosition(currentPointerY, overRect),
		});
	};

	const persistOrder = (nextItems: FlatCategoryItem[]) => {
		const updates = buildCategoryOrderUpdates(nextItems);

		startTransition(async () => {
			const result = await reorderCategoriesAction({
				type,
				categories: updates,
			});

			if (!result.success) {
				setItems(buildFlatCategories(categories, categoriesById));
				toast.error(result.error);
			}
		});
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setDropIndicator(null);

		if (!over || active.id === over.id) {
			return;
		}

		const position =
			dropIndicator?.overId === over.id
				? dropIndicator.position
				: resolveCategoryDropPosition(getPointerY(event), over.rect);

		const nextItems = applyCategoryDrop({
			items,
			activeId: String(active.id),
			overId: String(over.id),
			position,
		});

		if (!nextItems) {
			return;
		}

		const enrichedItems = enrichFlatCategories(nextItems);
		setItems(enrichedItems);
		persistOrder(enrichedItems);
	};

	return (
		<Card className="py-2">
			<CardContent className="px-2 py-4 sm:px-4">
				<p className="mb-3 text-muted-foreground text-sm">
					Arraste para reordenar. Solte no centro de uma categoria para
					transformá-la em subcategoria.
				</p>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragOver={handleDragOver}
					onDragEnd={handleDragEnd}
					onDragCancel={() => setDropIndicator(null)}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" />
								<TableHead>Categoria</TableHead>
								<TableHead className="text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<SortableContext
								items={itemIds}
								strategy={verticalListSortingStrategy}
							>
								{items.map((category, index) => (
									<SortableCategoryRow
										key={category.id}
										category={category}
										dropIndicator={dropIndicator}
										showGroupSeparator={hasGroupSeparatorBelow(items, index)}
										onEdit={onEdit}
										onCreateSubcategory={onCreateSubcategory}
										onRemoveRequest={onRemoveRequest}
									/>
								))}
							</SortableContext>
						</TableBody>
					</Table>
				</DndContext>
				{isPending ? (
					<p className="mt-2 text-muted-foreground text-xs">
						Salvando ordem...
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
