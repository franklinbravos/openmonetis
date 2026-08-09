"use server";

import { z } from "zod";
import { resolveCardImportPdfPasswordAttempts } from "@/features/cards/lib/resolve-import-pdf-password";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { uuidSchema } from "@/shared/lib/schemas/common";

const schema = z.object({
	cardId: uuidSchema("Cartão"),
});

export async function fetchCardImportPdfPasswordAttemptsAction(
	input: z.infer<typeof schema>,
): Promise<
	{ success: true; attempts: string[] } | { success: false; error: string }
> {
	try {
		const userId = await getUserId();
		const { cardId } = schema.parse(input);
		const attempts = await resolveCardImportPdfPasswordAttempts(userId, cardId);

		return { success: true, attempts };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}
