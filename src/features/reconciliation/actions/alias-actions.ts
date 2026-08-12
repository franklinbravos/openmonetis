"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { categories, reconciliationAliases } from "@/db/schema";
import { RECONCILIATION_ALIAS_SOURCES } from "@/features/reconciliation/lib/constants";
import { normalizeStatementKey } from "@/features/reconciliation/lib/normalize-statement-key";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";
import type { ActionResult } from "@/shared/lib/types/actions";

export async function fetchReconciliationAliases(
	descriptions: string[],
): Promise<
	Record<string, { targetName: string; targetCategoryId: string | null }>
> {
	const userId = await getUserId();
	const keys = [
		...new Set(descriptions.map(normalizeStatementKey).filter(Boolean)),
	];

	if (keys.length === 0) {
		return {};
	}

	const rows = await db
		.select({
			statementKey: reconciliationAliases.statementKey,
			targetName: reconciliationAliases.targetName,
			targetCategoryId: reconciliationAliases.targetCategoryId,
		})
		.from(reconciliationAliases)
		.where(
			and(
				eq(reconciliationAliases.userId, userId),
				inArray(reconciliationAliases.statementKey, keys),
			),
		);

	return Object.fromEntries(
		rows.map((row) => [
			row.statementKey,
			{
				targetName: row.targetName,
				targetCategoryId: row.targetCategoryId,
			},
		]),
	);
}

const saveAliasSchema = z.object({
	statementDescription: z.string().min(1),
	targetName: z.string().min(1),
	targetCategoryId: uuidSchema("Categoria").nullable().optional(),
	source: z
		.enum([
			RECONCILIATION_ALIAS_SOURCES.MANUAL,
			RECONCILIATION_ALIAS_SOURCES.CONFIRMED,
			RECONCILIATION_ALIAS_SOURCES.AI,
		])
		.default(RECONCILIATION_ALIAS_SOURCES.MANUAL),
});

export async function saveReconciliationAliasAction(
	input: z.infer<typeof saveAliasSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = saveAliasSchema.parse(input);
		const statementKey = normalizeStatementKey(data.statementDescription);

		if (!statementKey) {
			return { success: false, error: "Descrição do extrato inválida." };
		}

		if (data.targetCategoryId) {
			const category = await db.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.id, data.targetCategoryId),
					eq(categories.userId, userId),
				),
			});

			if (!category) {
				return { success: false, error: "Categoria não encontrada." };
			}
		}

		await db
			.insert(reconciliationAliases)
			.values({
				userId,
				statementKey,
				targetName: data.targetName.trim(),
				targetCategoryId: data.targetCategoryId ?? null,
				source: data.source,
				hitCount: 1,
				lastUsedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					reconciliationAliases.userId,
					reconciliationAliases.statementKey,
				],
				set: {
					targetName: data.targetName.trim(),
					targetCategoryId: data.targetCategoryId ?? null,
					source: data.source,
					hitCount: sql`${reconciliationAliases.hitCount} + 1`,
					lastUsedAt: new Date(),
					updatedAt: new Date(),
				},
			});

		return { success: true, message: "Alias salvo com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
