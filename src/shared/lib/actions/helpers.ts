import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { ActionError } from "@/shared/lib/actions/action-error";
import { FinancialAccessError } from "@/shared/lib/payers/financial-access";

export type { ActionResult } from "@/shared/lib/types/actions";
export { ActionError };

import type { ActionResult } from "@/shared/lib/types/actions";
import { errorResult } from "@/shared/lib/types/actions";

/**
 * Handles errors in server actions consistently
 * @param error - The error to handle
 * @returns ActionResult with error message
 */
export function handleActionError(error: unknown): ActionResult {
	// redirect()/notFound() sinalizam por exceção: engolir aqui transformaria
	// sessão expirada em toast genérico em vez de levar ao login.
	unstable_rethrow(error);

	if (error instanceof z.ZodError) {
		return errorResult(error.issues[0]?.message ?? "Dados inválidos.");
	}

	// Erros de negócio carregam mensagens acionáveis que podem ir ao usuário.
	if (error instanceof ActionError) {
		return errorResult(error.message);
	}

	if (error instanceof FinancialAccessError) {
		return errorResult(error.message);
	}

	console.error("[ActionError]", error);
	return errorResult("Ocorreu um erro inesperado. Tente novamente.");
}

/**
 * Configuration for revalidation after mutations
 */
const revalidateConfig = {
	cards: ["/cards", "/accounts", "/transactions"],
	accounts: ["/accounts", "/transactions"],
	categories: ["/categories"],
	establishments: ["/reports/establishments", "/transactions"],
	budgets: ["/budgets"],
	payers: ["/payers"],
	notes: ["/notes", "/notes/archived", "/dashboard"],
	notifications: ["/dashboard"],
	transactions: ["/transactions", "/accounts", "/attachments"],
	inbox: ["/inbox", "/transactions", "/dashboard"],
	attachments: ["/attachments"],
} as const;

/** Entities whose mutations should invalidate the dashboard cache */
const DASHBOARD_ENTITIES: ReadonlySet<string> = new Set([
	"transactions",
	"accounts",
	"cards",
	"budgets",
	"payers",
	"notes",
	"notifications",
	"inbox",
	"recurring",
]);

/**
 * Revalidates paths for a specific entity.
 * Also invalidates the user-scoped dashboard cache tag for financial entities.
 * @param entity - The entity type
 */
export function revalidateForEntity(
	entity: keyof typeof revalidateConfig,
	userId: string,
): void {
	// Adia invalidação para depois da resposta da Server Action. Com
	// cacheComponents, revalidate síncrono na mesma request corrompe o payload
	// RSC e o cliente recebe "unexpected response".
	after(() => {
		revalidateConfig[entity].forEach((path) => revalidatePath(path));

		if (DASHBOARD_ENTITIES.has(entity)) {
			revalidateTag(`dashboard-${userId}`, "max");
		}
	});
}
