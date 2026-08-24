"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { categories, importCategoryMappings, payers } from "@/db/schema";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { normalizeOptionalUuid } from "@/shared/lib/schemas/common";
import { callRpc } from "@/shared/lib/supabase/rpc";

export type ImportDescriptionMemory = {
	categoryId: string | null;
	payerId: string | null;
};

function mergeDescriptionMemory(
	keys: string[],
	...sources: Record<string, ImportDescriptionMemory>[]
): Record<string, ImportDescriptionMemory> {
	return Object.fromEntries(
		keys.map((key) => {
			let categoryId: string | null = null;
			let payerId: string | null = null;

			for (const source of sources) {
				const entry = source[key];
				if (!entry) continue;
				categoryId ??= entry.categoryId;
				payerId ??= entry.payerId;
			}

			return [key, { categoryId, payerId }];
		}),
	);
}

type DescriptionMemoryRow = {
	description_key: string | null;
	categoria_id: string | null;
	pagador_id: string | null;
};

/**
 * Memória vinda da RPC, que normaliza e casa prefixo no próprio banco.
 *
 * A normalização precisa acontecer no SQL: PostgREST não expressa
 * `lower(regexp_replace(...))` nem em filtro nem em projeção. Devolve `null`
 * quando a função não existe — a conferência segue sem sugestão em vez de
 * quebrar a tela.
 */
async function fetchDescriptionMemoryFromRpc(
	userId: string,
	keys: string[],
): Promise<Record<string, ImportDescriptionMemory> | null> {
	try {
		const rows = await callRpc<DescriptionMemoryRow>(
			"get_import_description_memory",
			{ p_user_id: userId, p_keys: keys },
		);

		const memory: Record<string, ImportDescriptionMemory> = {};
		for (const row of rows) {
			if (!row.description_key) continue;
			memory[row.description_key] = {
				categoryId: row.categoria_id,
				payerId: row.pagador_id,
			};
		}

		return memory;
	} catch (error) {
		console.error("fetchDescriptionMemoryFromRpc", error);
		return null;
	}
}

export async function fetchImportDescriptionMemory(
	descriptions: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const keys = [
		...new Set(descriptions.map(normalizeDescriptionKey).filter(Boolean)),
	];
	if (keys.length === 0) return {};

	const rpcMemory = await fetchDescriptionMemoryFromRpc(dataOwnerUserId, keys);
	return mergeDescriptionMemory(keys, rpcMemory ?? {});
}

// Compat: retorna apenas categoryId para chamadas legadas.
export async function fetchCategoryMappings(
	descriptions: string[],
): Promise<Record<string, string>> {
	const memory = await fetchImportDescriptionMemory(descriptions);

	return Object.fromEntries(
		Object.entries(memory).flatMap(([key, value]) =>
			value.categoryId ? [[key, value.categoryId]] : [],
		),
	);
}

export async function saveCategoryMappings(
	rows: {
		description: string;
		sourceDescription?: string;
		categoryId: string | null;
		payerId?: string | null;
	}[],
): Promise<void> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);

		const toUpsert = rows
			.map((row) => ({
				...row,
				categoryId: normalizeOptionalUuid(row.categoryId),
				payerId: normalizeOptionalUuid(row.payerId),
			}))
			.filter((row) => row.categoryId !== null)
			.flatMap((row) => {
				const keys = new Set<string>();
				const correctedKey = normalizeDescriptionKey(row.description);
				const sourceKey = normalizeDescriptionKey(
					row.sourceDescription ?? row.description,
				);

				if (correctedKey.length > 0) keys.add(correctedKey);
				if (sourceKey.length > 0) keys.add(sourceKey);

				return [...keys].map((descriptionKey) => ({
					userId: dataOwnerUserId,
					descriptionKey,
					categoryId: row.categoryId as string,
					payerId: row.payerId,
					updatedAt: new Date(),
				}));
			})
			.filter((row) => row.descriptionKey.length > 0);

		if (toUpsert.length === 0) return;

		// Valida ownership de todas as referências antes de gravar — IDs de
		// categorias/pessoas de outro usuário jamais devem entrar na memória.
		const referencedCategoryIds = new Set(
			toUpsert.map((row) => row.categoryId),
		);
		const referencedPayerIds = new Set(
			toUpsert
				.map((row) => row.payerId)
				.filter((id): id is string => Boolean(id)),
		);

		const [ownedCategories, ownedPayers] = await Promise.all([
			referencedCategoryIds.size > 0
				? db
						.select({ id: categories.id })
						.from(categories)
						.where(
							and(
								inArray(categories.id, [...referencedCategoryIds]),
								eq(categories.userId, dataOwnerUserId),
							),
						)
				: Promise.resolve([]),
			referencedPayerIds.size > 0
				? db
						.select({ id: payers.id })
						.from(payers)
						.where(
							and(
								inArray(payers.id, [...referencedPayerIds]),
								eq(payers.userId, dataOwnerUserId),
							),
						)
				: Promise.resolve([]),
		]);

		const ownedCategoryIds = new Set(ownedCategories.map((row) => row.id));
		const ownedPayerIds = new Set(ownedPayers.map((row) => row.id));

		const validRows = toUpsert.filter(
			(row) =>
				ownedCategoryIds.has(row.categoryId) &&
				(row.payerId === null || ownedPayerIds.has(row.payerId)),
		);

		if (validRows.length === 0) return;

		// Mesma descrição pode aparecer mais de uma vez no lote; o Postgres
		// não aceita duas linhas com a mesma PK no mesmo INSERT ... ON CONFLICT.
		const dedupedByKey = new Map(
			validRows.map((row) => [row.descriptionKey, row] as const),
		);

		await db
			.insert(importCategoryMappings)
			.values([...dedupedByKey.values()])
			.onConflictDoUpdate({
				target: [
					importCategoryMappings.userId,
					importCategoryMappings.descriptionKey,
				],
				set: {
					categoryId: sql`excluded.category_id`,
					payerId: sql`excluded.pagador_id`,
					updatedAt: sql`excluded.updated_at`,
				},
			});
	} catch (error) {
		console.error("[saveCategoryMappings]", error);
	}
}
