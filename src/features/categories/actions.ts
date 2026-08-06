"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { categories } from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { CATEGORY_TYPES } from "@/shared/lib/categories/constants";
import {
	getCategoryDescendantIds,
	isValidCategoryParent,
} from "@/shared/lib/categories/tree";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { normalizeIconInput } from "@/shared/utils/string";

const parentIdSchema = z
	.union([uuidSchema("Parent category"), z.literal(""), z.null()])
	.optional()
	.transform((value) => (value ? value : null));

const categoryBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome da categoria." })
		.trim()
		.min(1, "Informe o nome da categoria."),
	type: z.enum(CATEGORY_TYPES, {
		message: "Tipo de categoria inválido.",
	}),
	icon: z
		.string()
		.trim()
		.max(100, "O ícone deve ter no máximo 100 caracteres.")
		.nullish()
		.transform((value) => normalizeIconInput(value)),
	parentId: parentIdSchema,
});

const createCategorySchema = categoryBaseSchema;
const updateCategorySchema = categoryBaseSchema.extend({
	id: uuidSchema("Category"),
});
const deleteCategorySchema = z.object({
	id: uuidSchema("Category"),
});

const reorderCategoriesSchema = z.object({
	type: z.enum(CATEGORY_TYPES),
	categories: z
		.array(
			z.object({
				id: uuidSchema("Category"),
				parentId: parentIdSchema,
				sortOrder: z.number().int().min(0),
			}),
		)
		.min(1),
});

type CategoryCreateInput = z.infer<typeof createCategorySchema>;
type CategoryUpdateInput = z.infer<typeof updateCategorySchema>;
type CategoryDeleteInput = z.infer<typeof deleteCategorySchema>;
type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

type CreatedCategoryResult = {
	id: string;
	name: string;
	type: (typeof CATEGORY_TYPES)[number];
	icon: string | null;
	parentId: string | null;
};

async function fetchUserCategoriesForValidation(userId: string) {
	return db.query.categories.findMany({
		columns: {
			id: true,
			parentId: true,
			type: true,
		},
		where: eq(categories.userId, userId),
	});
}

function validateCategoryParent(
	categoryId: string | null,
	parentId: string | null,
	type: (typeof CATEGORY_TYPES)[number],
	userCategories: Awaited<ReturnType<typeof fetchUserCategoriesForValidation>>,
): { success: false; error: string } | null {
	if (isValidCategoryParent(categoryId, parentId, userCategories, type)) {
		return null;
	}

	return {
		success: false,
		error: "Categoria pai inválida para esta categoria.",
	};
}

export async function createCategoryAction(
	input: CategoryCreateInput,
): Promise<ActionResult<CreatedCategoryResult>> {
	try {
		const user = await getUser();
		const data = createCategorySchema.parse(input);
		const userCategories = await fetchUserCategoriesForValidation(user.id);
		const parentValidation = validateCategoryParent(
			null,
			data.parentId ?? null,
			data.type,
			userCategories,
		);

		if (parentValidation) {
			return parentValidation;
		}

		const [created] = await db
			.insert(categories)
			.values({
				name: data.name,
				type: data.type,
				icon: data.icon,
				parentId: data.parentId ?? null,
				userId: user.id,
			})
			.returning({
				id: categories.id,
				name: categories.name,
				type: categories.type,
				icon: categories.icon,
				parentId: categories.parentId,
			});

		if (!created) {
			return {
				success: false,
				error: "Falha ao criar categoria.",
			};
		}

		revalidateForEntity("categories", user.id);

		return {
			success: true,
			message: "Category criada com sucesso.",
			data: {
				id: created.id,
				name: created.name,
				type: created.type as CreatedCategoryResult["type"],
				icon: created.icon,
				parentId: created.parentId ?? null,
			},
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<CreatedCategoryResult>;
	}
}

export async function updateCategoryAction(
	input: CategoryUpdateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateCategorySchema.parse(input);

		// Buscar categoria antes de atualizar para verificar restrições
		const categoria = await db.query.categories.findFirst({
			columns: { id: true, name: true },
			where: and(eq(categories.id, data.id), eq(categories.userId, user.id)),
		});

		if (!categoria) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		// Bloquear edição das categories protegidas
		const categoriasProtegidas = [
			"Transferência interna",
			"Saldo inicial",
			"Pagamentos",
		];
		if (categoriasProtegidas.includes(categoria.name)) {
			return {
				success: false,
				error: `A categoria '${categoria.name}' é protegida e não pode ser editada.`,
			};
		}

		const userCategories = await fetchUserCategoriesForValidation(user.id);
		const parentValidation = validateCategoryParent(
			data.id,
			data.parentId ?? null,
			data.type,
			userCategories,
		);

		if (parentValidation) {
			return parentValidation;
		}

		const [updated] = await db
			.update(categories)
			.set({
				name: data.name,
				type: data.type,
				icon: data.icon,
				parentId: data.parentId ?? null,
			})
			.where(and(eq(categories.id, data.id), eq(categories.userId, user.id)))
			.returning();

		if (!updated) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Categoria atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteCategoryAction(
	input: CategoryDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteCategorySchema.parse(input);

		// Buscar categoria antes de deletar para verificar restrições
		const categoria = await db.query.categories.findFirst({
			columns: { id: true, name: true },
			where: and(eq(categories.id, data.id), eq(categories.userId, user.id)),
		});

		if (!categoria) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		// Bloquear remoção das categories protegidas
		const categoriasProtegidas = [
			"Transferência interna",
			"Saldo inicial",
			"Pagamentos",
		];
		if (categoriasProtegidas.includes(categoria.name)) {
			return {
				success: false,
				error: `A categoria '${categoria.name}' é protegida e não pode ser removida.`,
			};
		}

		const childCategory = await db.query.categories.findFirst({
			columns: { id: true },
			where: and(
				eq(categories.userId, user.id),
				eq(categories.parentId, data.id),
			),
		});

		if (childCategory) {
			return {
				success: false,
				error:
					"Remova ou reassocie as subcategorias antes de excluir esta categoria.",
			};
		}

		const [deleted] = await db
			.delete(categories)
			.where(and(eq(categories.id, data.id), eq(categories.userId, user.id)))
			.returning({ id: categories.id });

		if (!deleted) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Category removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function reorderCategoriesAction(
	input: ReorderCategoriesInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = reorderCategoriesSchema.parse(input);
		const categoryIds = data.categories.map((category) => category.id);
		const userCategories = await fetchUserCategoriesForValidation(user.id);
		const categoriesById = new Map(
			userCategories.map((category) => [category.id, category]),
		);

		if (categoryIds.some((categoryId) => !categoriesById.has(categoryId))) {
			return {
				success: false,
				error: "Uma ou mais categorias não foram encontradas.",
			};
		}

		const uniqueIds = new Set(categoryIds);
		if (uniqueIds.size !== categoryIds.length) {
			return {
				success: false,
				error: "A ordem enviada contém categorias duplicadas.",
			};
		}

		for (const category of data.categories) {
			const current = categoriesById.get(category.id);
			if (!current || current.type !== data.type) {
				return {
					success: false,
					error: "A ordem enviada contém categorias inválidas para este tipo.",
				};
			}

			const parentValidation = validateCategoryParent(
				category.id,
				category.parentId ?? null,
				data.type,
				userCategories,
			);

			if (parentValidation) {
				return parentValidation;
			}

			if (category.parentId) {
				const descendants = getCategoryDescendantIds(
					category.id,
					userCategories,
				);
				if (descendants.has(category.parentId)) {
					return {
						success: false,
						error: "Não é possível mover uma categoria para dentro dela mesma.",
					};
				}
			}
		}

		await db.transaction(async (tx) => {
			for (const category of data.categories) {
				await tx
					.update(categories)
					.set({
						parentId: category.parentId ?? null,
						sortOrder: category.sortOrder,
					})
					.where(
						and(
							eq(categories.id, category.id),
							eq(categories.userId, user.id),
							eq(categories.type, data.type),
						),
					);
			}
		});

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Ordem das categorias atualizada." };
	} catch (error) {
		return handleActionError(error);
	}
}
