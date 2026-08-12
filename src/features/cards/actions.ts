"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { cards, financialAccounts } from "@/db/schema";
import {
	ActionError,
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { encryptSecret } from "@/shared/lib/ai/secret-encryption";
import { getUser } from "@/shared/lib/auth/server";
import {
	CARD_IMPORT_PDF_PASSWORD_RULES,
	type CardImportPdfPasswordRule,
	validateCardImportPdfPasswordInput,
} from "@/shared/lib/cards/import-pdf-password";
import { db } from "@/shared/lib/db";
import { loadLogoOptions } from "@/shared/lib/logo/options";
import {
	dayOfMonthSchema,
	noteSchema,
	uuidSchema,
} from "@/shared/lib/schemas/common";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { normalizeFilePath } from "@/shared/utils/string";

const importPdfPasswordRuleSchema = z.enum([
	CARD_IMPORT_PDF_PASSWORD_RULES.none,
	CARD_IMPORT_PDF_PASSWORD_RULES.fixed,
	CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6,
	CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6,
	CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits,
]);

const cardBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome do cartão." })
		.trim()
		.min(1, "Informe o nome do cartão."),
	brand: z
		.string({ message: "Informe a bandeira." })
		.trim()
		.min(1, "Informe a bandeira."),
	status: z
		.string({ message: "Informe o status do cartão." })
		.trim()
		.min(1, "Informe o status do cartão."),
	closingDay: dayOfMonthSchema,
	dueDay: dayOfMonthSchema,
	note: noteSchema,
	limit: z.number({ message: "Limite inválido." }).min(0, "Limite inválido."),
	logo: z
		.string({ message: "Selecione um logo." })
		.trim()
		.min(1, "Selecione um logo."),
	accountId: uuidSchema("FinancialAccount"),
	importPdfPasswordRule: importPdfPasswordRuleSchema.default(
		CARD_IMPORT_PDF_PASSWORD_RULES.none,
	),
	importPdfPasswordSecret: z.string().nullable().optional(),
});

const createCardSchema = cardBaseSchema;
const updateCardSchema = cardBaseSchema.extend({
	id: uuidSchema("Cartão"),
});
const deleteCardSchema = z.object({
	id: uuidSchema("Cartão"),
});

type CardCreateInput = z.infer<typeof createCardSchema>;
type CardUpdateInput = z.infer<typeof updateCardSchema>;
type CardDeleteInput = z.infer<typeof deleteCardSchema>;

export type CardCreateResultData = {
	id: string;
	name: string;
	logo: string | null;
	closingDay: string;
	dueDay: string;
};

async function assertAccountOwnership(userId: string, accountId: string) {
	const account = await db.query.financialAccounts.findFirst({
		columns: { id: true },
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, userId),
		),
	});

	if (!account) {
		throw new ActionError("Conta vinculada não encontrada.");
	}
}

function resolveImportPdfPasswordPersistence(
	input: {
		importPdfPasswordRule: CardImportPdfPasswordRule;
		importPdfPasswordSecret?: string | null;
	},
	existingSecret: string | null,
): {
	importPdfPasswordRule: string | null;
	importPdfPasswordSecret: string | null;
} {
	const hasStoredSecret = Boolean(existingSecret);
	const validation = validateCardImportPdfPasswordInput(
		input.importPdfPasswordRule,
		input.importPdfPasswordSecret ?? "",
		hasStoredSecret,
	);

	if (!validation.success) {
		throw new ActionError(validation.error);
	}

	if (input.importPdfPasswordRule === CARD_IMPORT_PDF_PASSWORD_RULES.none) {
		return {
			importPdfPasswordRule: null,
			importPdfPasswordSecret: null,
		};
	}

	const secretInput = input.importPdfPasswordSecret?.trim() ?? "";
	if (!secretInput) {
		return {
			importPdfPasswordRule: input.importPdfPasswordRule,
			importPdfPasswordSecret: existingSecret,
		};
	}

	return {
		importPdfPasswordRule: input.importPdfPasswordRule,
		importPdfPasswordSecret: encryptSecret(secretInput),
	};
}

export async function createCardAction(
	input: CardCreateInput,
): Promise<ActionResult<CardCreateResultData>> {
	try {
		const user = await getUser();
		const data = createCardSchema.parse(input);

		await assertAccountOwnership(user.id, data.accountId);

		const logoFile = normalizeFilePath(data.logo);
		const importPdfPassword = resolveImportPdfPasswordPersistence(
			{
				importPdfPasswordRule: data.importPdfPasswordRule,
				importPdfPasswordSecret: data.importPdfPasswordSecret,
			},
			null,
		);

		const [created] = await db
			.insert(cards)
			.values({
				name: data.name,
				brand: data.brand,
				status: data.status,
				closingDay: data.closingDay,
				dueDay: data.dueDay,
				note: data.note ?? null,
				limit: formatDecimalForDbRequired(data.limit),
				logo: logoFile,
				accountId: data.accountId,
				userId: user.id,
				importPdfPasswordRule: importPdfPassword.importPdfPasswordRule,
				importPdfPasswordSecret: importPdfPassword.importPdfPasswordSecret,
			})
			.returning({
				id: cards.id,
				name: cards.name,
				logo: cards.logo,
				closingDay: cards.closingDay,
				dueDay: cards.dueDay,
			});

		if (!created) {
			throw new ActionError("Não foi possível criar o cartão.");
		}

		revalidateForEntity("cards", user.id);

		return {
			success: true,
			message: "Cartão criado com sucesso.",
			data: {
				id: created.id,
				name: created.name,
				logo: created.logo,
				closingDay: created.closingDay,
				dueDay: created.dueDay,
			},
		};
	} catch (error) {
		const result = handleActionError(error);
		return {
			success: false,
			error: result.success ? "Ocorreu um erro inesperado." : result.error,
		};
	}
}

export async function fetchCardFormOptionsAction(): Promise<{
	logoOptions: string[];
	accounts: Array<{ id: string; name: string; logo: string | null }>;
}> {
	const user = await getUser();
	const [logoOptions, accountRows] = await Promise.all([
		loadLogoOptions(),
		db.query.financialAccounts.findMany({
			columns: {
				id: true,
				name: true,
				logo: true,
			},
			orderBy: (table, { desc }) => [desc(table.name)],
			where: and(
				eq(financialAccounts.userId, user.id),
				eq(financialAccounts.status, "Ativa"),
			),
		}),
	]);

	return { logoOptions, accounts: accountRows };
}

export async function updateCardAction(
	input: CardUpdateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateCardSchema.parse(input);

		await assertAccountOwnership(user.id, data.accountId);

		const logoFile = normalizeFilePath(data.logo);

		const existingCard = await db.query.cards.findFirst({
			columns: {
				importPdfPasswordSecret: true,
			},
			where: and(eq(cards.id, data.id), eq(cards.userId, user.id)),
		});

		if (!existingCard) {
			return {
				success: false,
				error: "Cartão não encontrado.",
			};
		}

		const importPdfPassword = resolveImportPdfPasswordPersistence(
			{
				importPdfPasswordRule: data.importPdfPasswordRule,
				importPdfPasswordSecret: data.importPdfPasswordSecret,
			},
			existingCard.importPdfPasswordSecret,
		);

		const [updated] = await db
			.update(cards)
			.set({
				name: data.name,
				brand: data.brand,
				status: data.status,
				closingDay: data.closingDay,
				dueDay: data.dueDay,
				note: data.note ?? null,
				limit: formatDecimalForDbRequired(data.limit),
				logo: logoFile,
				accountId: data.accountId,
				importPdfPasswordRule: importPdfPassword.importPdfPasswordRule,
				importPdfPasswordSecret: importPdfPassword.importPdfPasswordSecret,
			})
			.where(and(eq(cards.id, data.id), eq(cards.userId, user.id)))
			.returning();

		if (!updated) {
			return {
				success: false,
				error: "Cartão não encontrado.",
			};
		}

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Cartão atualizado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteCardAction(
	input: CardDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteCardSchema.parse(input);

		const [deleted] = await db
			.delete(cards)
			.where(and(eq(cards.id, data.id), eq(cards.userId, user.id)))
			.returning({ id: cards.id });

		if (!deleted) {
			return {
				success: false,
				error: "Cartão não encontrado.",
			};
		}

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Cartão removido com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
