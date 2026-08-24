"use server";

import { and, eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";

export type CardLimitsSnapshot = {
	limit: number;
	guaranteedLimit: number | null;
};

function toNumber(value: unknown): number | null {
	if (value == null) return null;
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchCardLimitsAction(
	cardId: string,
): Promise<CardLimitsSnapshot | null> {
	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);

		const card = await db.query.cards.findFirst({
			columns: { limit: true, guaranteedLimit: true },
			where: and(eq(cards.userId, dataOwnerUserId), eq(cards.id, cardId)),
		});

		if (!card) return null;

		return {
			limit: toNumber(card.limit) ?? 0,
			guaranteedLimit: toNumber(card.guaranteedLimit),
		};
	} catch (error) {
		console.error("fetchCardLimitsAction", error);
		return null;
	}
}

/**
 * Grava os limites lidos da fatura.
 *
 * Só é chamada quando o usuário confirma na revisão: o limite pode ter sido
 * ajustado à mão, e sobrescrever em silêncio apagaria esse ajuste.
 */
export async function updateCardLimitsFromInvoiceAction(input: {
	cardId: string;
	limit: number;
	guaranteedLimit: number | null;
}): Promise<{ success: boolean }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);

		if (!(input.limit > 0)) return { success: false };

		await db
			.update(cards)
			.set({
				limit: formatDecimalForDbRequired(input.limit),
				guaranteedLimit:
					input.guaranteedLimit != null && input.guaranteedLimit > 0
						? formatDecimalForDbRequired(input.guaranteedLimit)
						: null,
			})
			.where(
				and(eq(cards.userId, dataOwnerUserId), eq(cards.id, input.cardId)),
			);

		await revalidateForEntity("cards", userId);
		return { success: true };
	} catch (error) {
		console.error("updateCardLimitsFromInvoiceAction", error);
		return { success: false };
	}
}
