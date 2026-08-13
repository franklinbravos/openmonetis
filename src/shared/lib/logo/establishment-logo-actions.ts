"use server";

import { and, eq } from "drizzle-orm";
import { establishmentLogos } from "@/db/schema";
import type { ActionResult } from "@/shared/lib/actions/helpers";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { toNameKey } from "@/shared/lib/logo";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";

/**
 * Salva ou atualiza o domínio Logo.dev preferido para um estabelecimento.
 */
export async function saveEstablishmentLogoAction(
	name: string,
	domain: string,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);
		const nameKey = toNameKey(name);

		await db
			.insert(establishmentLogos)
			.values({ userId: dataOwnerUserId, nameKey, domain })
			.onConflictDoUpdate({
				target: [establishmentLogos.userId, establishmentLogos.nameKey],
				set: { domain, updatedAt: new Date() },
			});

		revalidateForEntity("establishments", userId);
		return { success: true, message: "Logo salvo." };
	} catch (error) {
		return handleActionError(error);
	}
}

/**
 * Remove o mapeamento salvo, voltando ao comportamento automático do Logo.dev.
 */
export async function removeEstablishmentLogoAction(
	name: string,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);
		const nameKey = toNameKey(name);

		await db
			.delete(establishmentLogos)
			.where(
				and(
					eq(establishmentLogos.userId, dataOwnerUserId),
					eq(establishmentLogos.nameKey, nameKey),
				),
			);

		revalidateForEntity("establishments", userId);
		return { success: true, message: "Logo restaurado." };
	} catch (error) {
		return handleActionError(error);
	}
}
