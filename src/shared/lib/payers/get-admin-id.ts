import { cache } from "react";
import { resolveFinancialDataContext } from "@/shared/lib/payers/financial-context";

/**
 * Returns the admin pagador ID efetivo para leituras e mutações financeiras
 * (inclui admin compartilhado com permissão de edição).
 */
export const getAdminPayerId = cache(
	async (userId: string): Promise<string | null> => {
		const context = await resolveFinancialDataContext(userId);
		return context.adminPayerId;
	},
);
