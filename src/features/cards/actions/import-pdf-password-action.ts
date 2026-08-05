"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { cards } from "@/db/schema";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { encryptSecret } from "@/shared/lib/ai/secret-encryption";
import { getUser } from "@/shared/lib/auth/server";
import {
	CARD_IMPORT_PDF_PASSWORD_RULES,
	type CardImportPdfPasswordRule,
	isCardImportPdfPasswordRule,
	validateCardImportPdfPasswordInput,
} from "@/shared/lib/cards/import-pdf-password";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";

const saveImportPdfPasswordSchema = z.object({
	cardId: uuidSchema("Cartão"),
	rule: z.enum([
		CARD_IMPORT_PDF_PASSWORD_RULES.fixed,
		CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6,
		CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6,
		CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits,
	]),
	secret: z.string().trim().min(1, "Informe a senha ou documento."),
});

const updateImportPdfPasswordSettingsSchema = z.object({
	cardId: uuidSchema("Cartão"),
	rule: z.enum([
		CARD_IMPORT_PDF_PASSWORD_RULES.none,
		CARD_IMPORT_PDF_PASSWORD_RULES.fixed,
		CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6,
		CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6,
		CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits,
	]),
	secret: z.string().optional(),
});

function resolveImportPdfPasswordUpdate(
	rule: CardImportPdfPasswordRule,
	secret: string | undefined,
	existingSecret: string | null,
): {
	importPdfPasswordRule: string | null;
	importPdfPasswordSecret: string | null;
} {
	const hasStoredSecret = Boolean(existingSecret);
	const validation = validateCardImportPdfPasswordInput(
		rule,
		secret ?? "",
		hasStoredSecret,
	);

	if (!validation.success) {
		throw new Error(validation.error);
	}

	if (rule === CARD_IMPORT_PDF_PASSWORD_RULES.none) {
		return {
			importPdfPasswordRule: null,
			importPdfPasswordSecret: null,
		};
	}

	const secretInput = secret?.trim() ?? "";
	if (!secretInput) {
		return {
			importPdfPasswordRule: rule,
			importPdfPasswordSecret: existingSecret,
		};
	}

	return {
		importPdfPasswordRule: rule,
		importPdfPasswordSecret: encryptSecret(secretInput),
	};
}

export async function updateCardImportPdfPasswordSettingsAction(
	input: z.infer<typeof updateImportPdfPasswordSettingsSchema>,
): Promise<{ success: boolean; message?: string; error?: string }> {
	try {
		const user = await getUser();
		const data = updateImportPdfPasswordSettingsSchema.parse(input);

		if (!isCardImportPdfPasswordRule(data.rule)) {
			return { success: false, error: "Regra de senha inválida." };
		}

		const existingCard = await db.query.cards.findFirst({
			columns: {
				importPdfPasswordSecret: true,
			},
			where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
		});

		if (!existingCard) {
			return { success: false, error: "Cartão não encontrado." };
		}

		const importPdfPassword = resolveImportPdfPasswordUpdate(
			data.rule,
			data.secret,
			existingCard.importPdfPasswordSecret,
		);

		await db
			.update(cards)
			.set({
				importPdfPasswordRule: importPdfPassword.importPdfPasswordRule,
				importPdfPasswordSecret: importPdfPassword.importPdfPasswordSecret,
			})
			.where(and(eq(cards.id, data.cardId), eq(cards.userId, user.id)));

		revalidateForEntity("cards", user.id);

		return {
			success: true,
			message:
				data.rule === CARD_IMPORT_PDF_PASSWORD_RULES.none
					? "Senha automática removida deste cartão."
					: "Configurações de importação salvas.",
		};
	} catch (error) {
		if (error instanceof Error && error.message) {
			return { success: false, error: error.message };
		}

		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function saveCardImportPdfPasswordAction(
	input: z.infer<typeof saveImportPdfPasswordSchema>,
): Promise<{ success: boolean; message?: string; error?: string }> {
	try {
		const user = await getUser();
		const data = saveImportPdfPasswordSchema.parse(input);

		const validation = validateCardImportPdfPasswordInput(
			data.rule,
			data.secret,
			false,
		);
		if (!validation.success) {
			return { success: false, error: validation.error };
		}

		const [updated] = await db
			.update(cards)
			.set({
				importPdfPasswordRule: data.rule,
				importPdfPasswordSecret: encryptSecret(data.secret),
			})
			.where(and(eq(cards.id, data.cardId), eq(cards.userId, user.id)))
			.returning({ id: cards.id });

		if (!updated) {
			return { success: false, error: "Cartão não encontrado." };
		}

		revalidateForEntity("cards", user.id);

		return {
			success: true,
			message: "Senha de importação salva neste cartão.",
		};
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}
