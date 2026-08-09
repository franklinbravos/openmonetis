"use server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { importCategoryMappings, transactions } from "@/db/schema";
import {
	isTruncatedDescriptionMatch,
	MIN_DESCRIPTION_PREFIX_MATCH_LENGTH,
	normalizeDescriptionKey,
} from "@/features/transactions/lib/import-utils";
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
		if (!row.descriptionKey || memory[row.descriptionKey]) continue;
		memory[row.descriptionKey] = {
			categoryId: row.categoryId,
			payerId: row.payerId,
		};
	}

	return memory;
}

function getEligiblePrefixKeys(keys: string[]): string[] {
	return keys.filter((key) => key.length >= MIN_DESCRIPTION_PREFIX_MATCH_LENGTH);
}

function resolvePrefixMemoryForKeys(
	keys: string[],
	candidates: {
		descriptionKey: string;
		categoryId: string | null;
		payerId: string | null;
	}[],
): Record<string, ImportDescriptionMemory> {
	const memory: Record<string, ImportDescriptionMemory> = {};

	for (const importKey of getEligiblePrefixKeys(keys)) {
		const match = candidates.find(
			(candidate) =>
				candidate.descriptionKey &&
				isTruncatedDescriptionMatch(importKey, candidate.descriptionKey),
		);

		if (!match) continue;

		memory[importKey] = {
			categoryId: match.categoryId,
			payerId: match.payerId,
		};
	}

	return memory;
}

async function fetchSavedPrefixDescriptionMemory(
	userId: string,
	keys: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	const eligibleKeys = getEligiblePrefixKeys(keys);
	if (eligibleKeys.length === 0) return {};

	const rows = await db
		.select({
			descriptionKey: importCategoryMappings.descriptionKey,
			categoryId: importCategoryMappings.categoryId,
			payerId: importCategoryMappings.payerId,
			updatedAt: importCategoryMappings.updatedAt,
		})
		.from(importCategoryMappings)
		.where(
			and(
				eq(importCategoryMappings.userId, userId),
				or(
					...eligibleKeys.flatMap((key) => [
						sql`${importCategoryMappings.descriptionKey} like ${`${key}%`}`,
						sql`${key} like ${importCategoryMappings.descriptionKey} || '%'`,
					]),
				),
			),
		)
		.orderBy(desc(importCategoryMappings.updatedAt));

	return resolvePrefixMemoryForKeys(keys, rows);
}

async function fetchTransactionPrefixDescriptionMemory(
	userId: string,
	keys: string[],
): Promise<Record<string, ImportDescriptionMemory>> {
	const eligibleKeys = getEligiblePrefixKeys(keys);
	if (eligibleKeys.length === 0) return {};

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
				or(
					...eligibleKeys.flatMap((key) => [
						sql`${transactionDescriptionKeySql} like ${`${key}%`}`,
						sql`${key} like ${transactionDescriptionKeySql} || '%'`,
					]),
				),
			),
		)
		.orderBy(desc(transactions.createdAt));

	return resolvePrefixMemoryForKeys(keys, rows);
}

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

function getKeysMissingCategory(
	keys: string[],
	memory: Record<string, ImportDescriptionMemory>,
): string[] {
	return keys.filter((key) => !memory[key]?.categoryId);
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

	const exactMemory = mergeDescriptionMemory(
		keys,
		savedMemory,
		transactionMemory,
	);
	const keysMissingCategory = getKeysMissingCategory(keys, exactMemory);

	if (keysMissingCategory.length === 0) {
		return exactMemory;
	}

	const [savedPrefixMemory, transactionPrefixMemory] = await Promise.all([
		fetchSavedPrefixDescriptionMemory(userId, keysMissingCategory),
		fetchTransactionPrefixDescriptionMemory(userId, keysMissingCategory),
	]);

	return mergeDescriptionMemory(
		keys,
		exactMemory,
		savedPrefixMemory,
		transactionPrefixMemory,
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
		sourceDescription?: string;
		categoryId: string | null;
		payerId?: string | null;
	}[],
): Promise<void> {
	const userId = await getUserId();

	const toUpsert = rows
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
				userId,
				descriptionKey,
				categoryId: row.categoryId as string,
				payerId: row.payerId ?? null,
				updatedAt: new Date(),
			}));
		})
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
