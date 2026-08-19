"use server";

import { and, asc, eq } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { assertFinancialReadAccess } from "@/shared/lib/payers/financial-access";
import { uuidSchema } from "@/shared/lib/schemas/common";

export type InstallmentSeriesOccurrence = {
	id: string;
	period: string;
	amount: string;
	currentInstallment: number | null;
	installmentCount: number | null;
	isSettled: boolean | null;
	isAnticipated: boolean;
};

/**
 * Todas as ocorrências de uma série parcelada, da primeira à última.
 *
 * Serve à conferência dentro do modal de detalhes: com a série inteira à vista
 * dá para ver parcela faltando, valor fora do padrão e o que já foi pago.
 */
export async function fetchInstallmentSeriesAction(
	seriesId: string,
): Promise<InstallmentSeriesOccurrence[]> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialReadAccess(user.id);
		const validatedSeriesId = uuidSchema("Série").parse(seriesId);

		const rows = await db.query.transactions.findMany({
			where: and(
				eq(transactions.seriesId, validatedSeriesId),
				eq(transactions.userId, dataOwnerUserId),
			),
			orderBy: [asc(transactions.currentInstallment), asc(transactions.period)],
			columns: {
				id: true,
				period: true,
				amount: true,
				currentInstallment: true,
				installmentCount: true,
				isSettled: true,
				isAnticipated: true,
			},
		});

		return rows.map((row) => ({
			id: row.id,
			period: row.period,
			amount: row.amount,
			currentInstallment: row.currentInstallment,
			installmentCount: row.installmentCount,
			isSettled: row.isSettled,
			isAnticipated: row.isAnticipated ?? false,
		}));
	} catch (error) {
		console.error("fetchInstallmentSeriesAction", error);
		return [];
	}
}
