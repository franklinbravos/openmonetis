"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { importCategoryMappings, transactions } from "@/db/schema";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

export type ImportDescriptionMemory = {
	categoryId: string | null;
	payerId: string | null;
};

const transactionDescriptionKeySql = sql<string>`lower(regexp_replace(trim(${transactions.name}), '\\s+', ' ', 'g'))`;

async function fetchSavedDescriptionMemory(
	userId: string,
	keys: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	if (keys.length === 0) return {};

	const rows = await db
		.select({
			descriptionKey: importCategoryMappings.descriptionKey,
			categoryId: importCategoryMappings.categoryId,
			payerId: importCategoryMappings.payerId,
		})
		.from(importCategoryMappings)
		.where(
			and(
				eq(importCategoryMappings.userId, userId),
				inArray(importCategoryMappings.descriptionKey, keys),
			),
		);

	return Object.fromEntries(
		rows.map((row) => [
			row.descriptionKey,
			{
				categoryId: row.categoryId,
				payerId: row.payerId,
			},
		]),
	);
}

async function fetchTransactionDescriptionMemory(
	userId: string,
	keys: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	if (keys.length === 0) return {};

	const rows = await db
		.select({
			descriptionKey: transactionDescriptionKeySql,
			categoryId: transactions.categoryId,
			payerId: transactions.payerId,
			createdAt: transactions.createdAt,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				inArray(transactionDescriptionKeySql, keys),
			),
		)
		.orderBy(desc(transactions.createdAt));

	const memory: Record<string, ImportDescriptionMemory> = {};
	for (const row of rows) {
		if (memory[row.descriptionKey]) continue;
		memory[row.descriptionKey] = {
			categoryId: row.categoryId,
			payerId: row.payerId,
		};
	}

	return memory;
}

export async function fetchImportDescriptionMemory(
	descriptions: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	const userId = await getUserId();
	const keys = [
		...new Set(descriptions.map(normalizeDescriptionKey).filter(Boolean)),
	];
	if (keys.length === 0) return {};

	const [savedMemory, transactionMemory] = await Promise.all([
		fetchSavedDescriptionMemory(userId, keys),
		fetchTransactionDescriptionMemory(userId, keys),
	]);

	return Object.fromEntries(
		keys.map((key) => {
			const saved = savedMemory[key];
			const fromTransaction = transactionMemory[key];

			return [
				key,
				{
					categoryId: saved?.categoryId ?? fromTransaction?.categoryId ?? null,
					payerId: saved?.payerId ?? fromTransaction?.payerId ?? null,
				},
			];
		}),
	);
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
		categoryId: string | null;
		payerId?: string | null;
	}[],
): Promise<void> {
	const userId = await getUserId();

	const toUpsert = rows
		.filter((row) => row.categoryId !== null)
		.map((row) => ({
			userId,
			descriptionKey: normalizeDescriptionKey(row.description),
			categoryId: row.categoryId as string,
			payerId: row.payerId ?? null,
			updatedAt: new Date(),
		}))
		.filter((row) => row.descriptionKey.length > 0);

	if (toUpsert.length === 0) return;

	// Mesma descrição pode aparecer mais de uma vez no lote; o Postgres
	// não aceita duas linhas com a mesma PK no mesmo INSERT ... ON CONFLICT.
	const dedupedByKey = new Map(
		toUpsert.map((row) => [row.descriptionKey, row] as const),
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
}
