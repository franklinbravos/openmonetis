"use server";

import { z } from "zod";
import { reconciliationLines, reconciliationSessions } from "@/db/schema";
import {
	RECONCILIATION_MODES,
	RECONCILIATION_STATUSES,
	RECONCILIATION_TARGET_TYPES,
} from "@/features/reconciliation/lib/constants";
import { computeStatementTotal } from "@/features/reconciliation/lib/statement-totals";
import {
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";
import type { ActionResult } from "@/shared/lib/types/actions";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";

const statementLineSchema = z.object({
	externalId: z.string().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	amount: z.number().positive(),
	description: z.string().min(1, "Descrição obrigatória."),
	transactionType: z.enum(["income", "expense"]),
});

const createSessionSchema = z.object({
	targetType: z.enum([
		RECONCILIATION_TARGET_TYPES.CARD,
		RECONCILIATION_TARGET_TYPES.ACCOUNT,
	]),
	targetId: uuidSchema("Alvo"),
	period: z.string().regex(/^\d{4}-\d{2}$/, "Período inválido."),
	sourceFileName: z.string().trim().min(1, "Informe o arquivo."),
	sourceType: z.enum(["ofx", "xls"]),
	statementSource: z.string().nullable().optional(),
	statementAccountNumber: z.string().nullable().optional(),
	statementPeriodFrom: z.string().nullable().optional(),
	statementPeriodTo: z.string().nullable().optional(),
	lines: z
		.array(statementLineSchema)
		.min(1, "O extrato não possui linhas para conciliar."),
});

export type CreateReconciliationSessionInput = z.infer<
	typeof createSessionSchema
>;

export async function createReconciliationSessionAction(
	input: CreateReconciliationSessionInput,
): Promise<ActionResult<{ sessionId: string; lineCount: number }>> {
	try {
		const userId = await getUserId();
		const data = createSessionSchema.parse(input);

		const ownershipOk =
			data.targetType === RECONCILIATION_TARGET_TYPES.CARD
				? await validateCartaoOwnership(userId, data.targetId)
				: await validateContaOwnership(userId, data.targetId);

		if (!ownershipOk) {
			return {
				success: false,
				error:
					data.targetType === RECONCILIATION_TARGET_TYPES.CARD
						? "Cartão não encontrado."
						: "Conta não encontrada.",
			};
		}

		const mode =
			data.targetType === RECONCILIATION_TARGET_TYPES.CARD
				? RECONCILIATION_MODES.CARD_CLOSE
				: RECONCILIATION_MODES.ACCOUNT_CLOSE;

		const statementTotal = computeStatementTotal(data.lines);

		const [session] = await db
			.insert(reconciliationSessions)
			.values({
				userId,
				mode,
				targetType: data.targetType,
				targetId: data.targetId,
				period: data.period,
				sourceFileName: data.sourceFileName,
				sourceType: data.sourceType,
				statementSource: data.statementSource ?? null,
				statementAccountNumber: data.statementAccountNumber ?? null,
				statementPeriodFrom: data.statementPeriodFrom ?? null,
				statementPeriodTo: data.statementPeriodTo ?? null,
				statementTotal: formatDecimalForDbRequired(statementTotal),
				status: RECONCILIATION_STATUSES.DRAFT,
				lineCount: data.lines.length,
			})
			.returning({ id: reconciliationSessions.id });

		if (!session) {
			return { success: false, error: "Não foi possível criar a sessão." };
		}

		await db.insert(reconciliationLines).values(
			data.lines.map((line, index) => ({
				sessionId: session.id,
				userId,
				lineIndex: index,
				externalId: line.externalId,
				purchaseDate: line.date,
				description: line.description.trim(),
				amount: formatDecimalForDbRequired(line.amount),
				transactionType:
					line.transactionType === "income" ? "Receita" : "Despesa",
			})),
		);

		return {
			success: true,
			message: "Sessão criada com sucesso.",
			data: {
				sessionId: session.id,
				lineCount: data.lines.length,
			},
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			sessionId: string;
			lineCount: number;
		}>;
	}
}
