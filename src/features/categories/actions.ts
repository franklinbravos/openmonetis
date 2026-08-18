"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	categories,
	installmentAnticipations,
	transactions,
} from "@/db/schema";
import { resolveCategoryTypeForTransaction } from "@/features/categories/lib/category-select-options";
import {
	type CategoryLinkedTransaction,
	fetchCategoryLinkedTransactions,
} from "@/features/categories/queries";
import { fetchOwnedCategoryIds } from "@/features/transactions/actions/core";
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
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
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
	id: uuidSchema("Categoria"),
});
const deleteCategorySchema = z.object({
	id: uuidSchema("Categoria"),
});

const migrateCategoryTransactionsSchema = z.object({
	fromCategoryId: uuidSchema("Categoria"),
	toCategoryId: uuidSchema("Categoria"),
	transactionIds: z.array(uuidSchema("Transaction")).optional(),
});

const updateCategoryTransactionCategorySchema = z.object({
	transactionId: uuidSchema("Transaction"),
	categoryId: uuidSchema("Categoria"),
});

const reorderCategoriesSchema = z.object({
	type: z.enum(CATEGORY_TYPES),
	categories: z
		.array(
			z.object({
				id: uuidSchema("Categoria"),
				parentId: parentIdSchema,
				sortOrder: z.number().int().min(0),
			}),
		)
		.min(1),
});

type CategoryCreateInput = z.infer<typeof createCategorySchema>;
type CategoryUpdateInput = z.infer<typeof updateCategorySchema>;
type CategoryDeleteInput = z.infer<typeof deleteCategorySchema>;
type MigrateCategoryTransactionsInput = z.infer<
	typeof migrateCategoryTransactionsSchema
>;
type UpdateCategoryTransactionCategoryInput = z.infer<
	typeof updateCategoryTransactionCategorySchema
>;
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
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = createCategorySchema.parse(input);
		const userCategories =
			await fetchUserCategoriesForValidation(dataOwnerUserId);
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
				userId: dataOwnerUserId,
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
			message: "Categoria criada com sucesso.",
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
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = updateCategorySchema.parse(input);

		// Buscar categoria antes de atualizar para verificar restrições
		const categoria = await db.query.categories.findFirst({
			columns: { id: true, name: true },
			where: and(
				eq(categories.id, data.id),
				eq(categories.userId, dataOwnerUserId),
			),
		});

		if (!categoria) {
			return {
				success: false,
				error: "Categoria não encontrada.",
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

		const userCategories =
			await fetchUserCategoriesForValidation(dataOwnerUserId);
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
			.where(
				and(eq(categories.id, data.id), eq(categories.userId, dataOwnerUserId)),
			)
			.returning();

		if (!updated) {
			return {
				success: false,
				error: "Categoria não encontrada.",
			};
		}

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Categoria atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

async function validateTargetCategoryForTransactions(
	userId: string,
	targetCategoryId: string,
	transactionTypes: string[],
): Promise<{ success: false; error: string } | null> {
	const [targetCategory] = await db.query.categories.findMany({
		columns: { id: true, type: true },
		where: and(
			eq(categories.id, targetCategoryId),
			eq(categories.userId, userId),
		),
		limit: 1,
	});

	if (!targetCategory) {
		return { success: false, error: "Categoria de destino não encontrada." };
	}

	const incompatible = transactionTypes.some(
		(transactionType) =>
			targetCategory.type !==
			resolveCategoryTypeForTransaction(transactionType),
	);

	if (incompatible) {
		return {
			success: false,
			error:
				"A categoria de destino não é compatível com o tipo de um ou mais lançamentos.",
		};
	}

	return null;
}

export async function fetchCategoryLinkedTransactionsAction(
	categoryId: string,
): Promise<ActionResult<CategoryLinkedTransaction[]>> {
	try {
		const user = await getUser();
		const dataOwnerUserId = await getFinancialDataOwnerId(user.id);
		const data = deleteCategorySchema.parse({ id: categoryId });

		const category = await db.query.categories.findFirst({
			columns: { id: true },
			where: and(
				eq(categories.id, data.id),
				eq(categories.userId, dataOwnerUserId),
			),
		});

		if (!category) {
			return { success: false, error: "Categoria não encontrada." };
		}

		const linkedTransactions = await fetchCategoryLinkedTransactions(
			dataOwnerUserId,
			data.id,
		);

		return {
			success: true,
			message: "Lançamentos vinculados carregados.",
			data: linkedTransactions,
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<
			CategoryLinkedTransaction[]
		>;
	}
}

export async function migrateCategoryTransactionsAction(
	input: MigrateCategoryTransactionsInput,
): Promise<ActionResult<{ updatedCount: number }>> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = migrateCategoryTransactionsSchema.parse(input);

		if (data.fromCategoryId === data.toCategoryId) {
			return {
				success: false,
				error: "Escolha uma categoria diferente da que será removida.",
			};
		}

		const ownedCategoryIds = await fetchOwnedCategoryIds(user.id, [
			data.fromCategoryId,
			data.toCategoryId,
		]);

		if (
			!ownedCategoryIds.has(data.fromCategoryId) ||
			!ownedCategoryIds.has(data.toCategoryId)
		) {
			return { success: false, error: "Categoria não encontrada." };
		}

		const filters = [
			eq(transactions.userId, dataOwnerUserId),
			eq(transactions.categoryId, data.fromCategoryId),
		];

		if (data.transactionIds && data.transactionIds.length > 0) {
			const linkedRows = await db.query.transactions.findMany({
				columns: { id: true, transactionType: true },
				where: and(...filters, inArray(transactions.id, data.transactionIds)),
			});

			if (linkedRows.length === 0) {
				return {
					success: false,
					error: "Nenhum lançamento encontrado para migrar.",
				};
			}

			const validationError = await validateTargetCategoryForTransactions(
				dataOwnerUserId,
				data.toCategoryId,
				linkedRows.map((row) => row.transactionType),
			);
			if (validationError) {
				return validationError;
			}

			await db
				.update(transactions)
				.set({ categoryId: data.toCategoryId })
				.where(and(...filters, inArray(transactions.id, data.transactionIds)));

			revalidateForEntity("categories", user.id);
			revalidateForEntity("transactions", user.id);

			return {
				success: true,
				message: `${linkedRows.length} lançamento(s) migrado(s).`,
				data: { updatedCount: linkedRows.length },
			};
		}

		const linkedRows = await db.query.transactions.findMany({
			columns: { id: true, transactionType: true },
			where: and(...filters),
		});

		if (linkedRows.length === 0) {
			return {
				success: true,
				message: "Nenhum lançamento para migrar.",
				data: { updatedCount: 0 },
			};
		}

		const validationError = await validateTargetCategoryForTransactions(
			dataOwnerUserId,
			data.toCategoryId,
			linkedRows.map((row) => row.transactionType),
		);
		if (validationError) {
			return validationError;
		}

		await db
			.update(transactions)
			.set({ categoryId: data.toCategoryId })
			.where(and(...filters));

		revalidateForEntity("categories", user.id);
		revalidateForEntity("transactions", user.id);

		return {
			success: true,
			message: `${linkedRows.length} lançamento(s) migrado(s).`,
			data: { updatedCount: linkedRows.length },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{ updatedCount: number }>;
	}
}

export async function updateCategoryTransactionCategoryAction(
	input: UpdateCategoryTransactionCategoryInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = updateCategoryTransactionCategorySchema.parse(input);

		const transaction = await db.query.transactions.findFirst({
			columns: { id: true, transactionType: true, categoryId: true },
			where: and(
				eq(transactions.id, data.transactionId),
				eq(transactions.userId, dataOwnerUserId),
			),
		});

		if (!transaction) {
			return { success: false, error: "Lançamento não encontrado." };
		}

		const validationError = await validateTargetCategoryForTransactions(
			dataOwnerUserId,
			data.categoryId,
			[transaction.transactionType],
		);
		if (validationError) {
			return validationError;
		}

		await db
			.update(transactions)
			.set({ categoryId: data.categoryId })
			.where(
				and(
					eq(transactions.id, data.transactionId),
					eq(transactions.userId, dataOwnerUserId),
				),
			);

		revalidateForEntity("categories", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Categoria do lançamento atualizada." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteCategoryAction(
	input: CategoryDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = deleteCategorySchema.parse(input);

		// Buscar categoria antes de deletar para verificar restrições
		const categoria = await db.query.categories.findFirst({
			columns: { id: true, name: true },
			where: and(
				eq(categories.id, data.id),
				eq(categories.userId, dataOwnerUserId),
			),
		});

		if (!categoria) {
			return {
				success: false,
				error: "Categoria não encontrada.",
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
				eq(categories.userId, dataOwnerUserId),
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

		await db
			.update(transactions)
			.set({ categoryId: null })
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.categoryId, data.id),
				),
			);

		await db
			.update(installmentAnticipations)
			.set({ categoryId: null })
			.where(
				and(
					eq(installmentAnticipations.userId, dataOwnerUserId),
					eq(installmentAnticipations.categoryId, data.id),
				),
			);

		const [deleted] = await db
			.delete(categories)
			.where(
				and(eq(categories.id, data.id), eq(categories.userId, dataOwnerUserId)),
			)
			.returning({ id: categories.id });

		if (!deleted) {
			return {
				success: false,
				error: "Categoria não encontrada.",
			};
		}

		revalidateForEntity("categories", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Categoria removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function reorderCategoriesAction(
	input: ReorderCategoriesInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = reorderCategoriesSchema.parse(input);
		const categoryIds = data.categories.map((category) => category.id);
		const userCategories =
			await fetchUserCategoriesForValidation(dataOwnerUserId);
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
							eq(categories.userId, dataOwnerUserId),
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
