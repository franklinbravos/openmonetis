"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createCategoryAction,
	updateCategoryAction,
} from "@/features/categories/actions";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { useFormState } from "@/shared/hooks/use-form-state";
import { CATEGORY_TYPES } from "@/shared/lib/categories/constants";
import { getDefaultIconForType } from "@/shared/lib/categories/icons";
import {
	buildCategoryTree,
	flattenCategoryTree,
	getCategoryDescendantIds,
	isValidCategoryParent,
} from "@/shared/lib/categories/tree";

import { CategoryFormFields } from "./category-form-fields";
import type { Category, CategoryFormValues } from "./types";

export type CreatedCategory = {
	id: string;
	name: string;
	type: CategoryFormValues["type"];
	icon: string | null;
	parentId: string | null;
};

interface CategoryDialogProps {
	mode: "create" | "update";
	trigger?: React.ReactNode;
	category?: Category;
	allCategories?: Category[];
	defaultType?: CategoryFormValues["type"];
	defaultParentId?: string | null;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onCreated?: (category: CreatedCategory) => void;
}

const buildInitialValues = ({
	category,
	defaultType,
	defaultParentId,
}: {
	category?: Category;
	defaultType?: CategoryFormValues["type"];
	defaultParentId?: string | null;
}): CategoryFormValues => {
	const initialType = category?.type ?? defaultType ?? CATEGORY_TYPES[0];
	const fallbackIcon = getDefaultIconForType();
	const existingIcon = category?.icon ?? "";
	const icon = existingIcon || fallbackIcon;

	return {
		name: category?.name ?? "",
		type: initialType,
		icon,
		parentId: category?.parentId ?? defaultParentId ?? "",
	};
};

function buildParentOptions(
	allCategories: Category[],
	formState: CategoryFormValues,
	categoryId?: string,
) {
	const sameTypeCategories = allCategories.filter(
		(category) => category.type === formState.type,
	);
	const excludedIds = new Set<string>();

	if (categoryId) {
		excludedIds.add(categoryId);
		for (const descendantId of getCategoryDescendantIds(
			categoryId,
			sameTypeCategories,
		)) {
			excludedIds.add(descendantId);
		}
	}

	const eligibleCategories = sameTypeCategories.filter(
		(category) => !excludedIds.has(category.id),
	);

	return flattenCategoryTree(buildCategoryTree(eligibleCategories));
}

export function CategoryDialog({
	mode,
	trigger,
	category,
	allCategories = [],
	defaultType,
	defaultParentId,
	open,
	onOpenChange,
	onCreated,
}: CategoryDialogProps) {
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const initialState = useMemo(
		() =>
			buildInitialValues({
				category,
				defaultType,
				defaultParentId,
			}),
		[category, defaultParentId, defaultType],
	);

	const { formState, resetForm, updateField, updateFields } =
		useFormState<CategoryFormValues>(initialState);

	const parentOptions = useMemo(
		() => buildParentOptions(allCategories, formState, category?.id),
		[allCategories, category?.id, formState],
	);

	useEffect(() => {
		if (dialogOpen) {
			resetForm(initialState);
			setErrorMessage(null);
		}
	}, [dialogOpen, initialState, resetForm]);

	useEffect(() => {
		if (!dialogOpen) {
			setErrorMessage(null);
		}
	}, [dialogOpen]);

	const handleFieldChange = (
		field: keyof CategoryFormValues,
		value: string,
	) => {
		if (field === "type") {
			const nextParentId =
				formState.parentId &&
				isValidCategoryParent(
					category?.id ?? null,
					formState.parentId,
					allCategories,
					value,
				)
					? formState.parentId
					: "";

			updateFields({
				type: value as CategoryFormValues["type"],
				parentId: nextParentId,
			});
			return;
		}

		updateField(field, value);
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (mode === "update" && !category?.id) {
			const message = "Category inválida.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const payload = {
			name: formState.name.trim(),
			type: formState.type,
			icon: formState.icon.trim(),
			parentId: formState.parentId.trim() || null,
		};

		startTransition(async () => {
			const result =
				mode === "create"
					? await createCategoryAction(payload)
					: await updateCategoryAction({
							id: category?.id ?? "",
							...payload,
						});

			if (result.success) {
				toast.success(result.message);
				setDialogOpen(false);
				resetForm(initialState);
				if (mode === "create" && result.data && onCreated) {
					onCreated(result.data);
				}
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		});
	};

	const title = mode === "create" ? "Nova categoria" : "Atualizar categoria";
	const description =
		mode === "create"
			? "Crie uma categoria ou subcategoria para organizar seus lançamentos."
			: "Atualize os detalhes da categoria selecionada.";
	const submitLabel = mode === "create" ? "Salvar" : "Atualizar";

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
					<CategoryFormFields
						values={formState}
						onChange={handleFieldChange}
						parentOptions={parentOptions}
					/>

					{errorMessage && (
						<p className="text-sm text-destructive">{errorMessage}</p>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
