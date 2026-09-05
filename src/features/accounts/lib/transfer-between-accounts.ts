import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { categories, financialAccounts, transactions } from "@/db/schema";
import { ActionError, revalidateForEntity } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";
import { PERIOD_FORMAT_REGEX } from "@/shared/lib/invoices";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { uuidSchema } from "@/shared/lib/schemas/common";
import {
	TRANSFER_CATEGORY_NAME,
	TRANSFER_CONDITION,
	TRANSFER_ESTABLISHMENT_ENTRADA,
	TRANSFER_ESTABLISHMENT_SAIDA,
	TRANSFER_PAYMENT_METHOD,
} from "@/shared/lib/transfers/constants";
import type { ActionResult } from "@/shared/lib/types/actions";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";

const transferSchema = z.object({
	fromAccountId: uuidSchema("Conta de origem"),
	toAccountId: uuidSchema("Conta de destino"),
	amount: z
		.string()
		.trim()
		.transform((value) => (value.length === 0 ? "0" : value.replace(",", ".")))
		.refine(
			(value) => !Number.isNaN(Number.parseFloat(value)),
			"Informe um valor válido.",
		)
		.transform((value) => Number.parseFloat(value))
		.refine((value) => value > 0, "O valor deve ser maior que zero."),
	date: z
		.string({ message: "Informe uma data válida." })
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/u, "Informe uma data válida."),
	period: z
		.string({ message: "Informe o período." })
		.trim()
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
});

export type TransferBetweenAccountsInput = z.input<typeof transferSchema>;

export async function transferBetweenAccounts(
	viewerUserId: string,
	input: TransferBetweenAccountsInput,
): Promise<ActionResult<{ ids: string[] }>> {
	const { dataOwnerUserId } = await assertFinancialEditAccess(viewerUserId);
	const data = transferSchema.parse(input);

	const purchaseDate = parseLocalDateString(data.date);
	if (Number.isNaN(purchaseDate.getTime())) {
		throw new ActionError("Informe uma data válida.");
	}

	if (data.fromAccountId === data.toAccountId) {
		return {
			success: false,
			error: "A conta de origem e destino devem ser diferentes.",
		};
	}

	const transferId = crypto.randomUUID();
	const adminPayerId = await getAdminPayerId(viewerUserId);

	if (!adminPayerId) {
		throw new ActionError(
			"Pessoa administrador não encontrada. Por favor, crie uma pessoa admin.",
		);
	}

	let transactionIds: string[] = [];

	await db.transaction(async (tx: typeof db) => {
		const [fromAccount, toAccount] = await Promise.all([
			tx.query.financialAccounts.findFirst({
				columns: { id: true, name: true },
				where: and(
					eq(financialAccounts.id, data.fromAccountId),
					eq(financialAccounts.userId, dataOwnerUserId),
				),
			}),
			tx.query.financialAccounts.findFirst({
				columns: { id: true, name: true },
				where: and(
					eq(financialAccounts.id, data.toAccountId),
					eq(financialAccounts.userId, dataOwnerUserId),
				),
			}),
		]);

		if (!fromAccount) {
			throw new ActionError("Conta de origem não encontrada.");
		}

		if (!toAccount) {
			throw new ActionError("Conta de destino não encontrada.");
		}

		const [transferCategory] = await Promise.all([
			tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, dataOwnerUserId),
					eq(categories.name, TRANSFER_CATEGORY_NAME),
				),
			}),
		]);

		if (!transferCategory) {
			throw new ActionError(
				`Categoria "${TRANSFER_CATEGORY_NAME}" não encontrada. Por favor, crie esta categoria antes de fazer transferências.`,
			);
		}

		const transferNote = `de ${fromAccount.name} -> ${toAccount.name}`;

		const sharedFields = {
			condition: TRANSFER_CONDITION,
			paymentMethod: TRANSFER_PAYMENT_METHOD,
			note: transferNote,
			purchaseDate,
			transactionType: "Transferência" as const,
			period: data.period,
			isSettled: true,
			userId: dataOwnerUserId,
			categoryId: transferCategory.id,
			payerId: adminPayerId,
			transferId,
			cardId: null,
		};

		const inserted = await tx
			.insert(transactions)
			.values([
				{
					...sharedFields,
					name: TRANSFER_ESTABLISHMENT_SAIDA,
					amount: formatDecimalForDbRequired(-Math.abs(data.amount)),
					accountId: fromAccount.id,
				},
				{
					...sharedFields,
					name: TRANSFER_ESTABLISHMENT_ENTRADA,
					amount: formatDecimalForDbRequired(Math.abs(data.amount)),
					accountId: toAccount.id,
				},
			])
			.returning({ id: transactions.id });

		transactionIds = inserted.map((row) => row.id);
	});

	revalidateForEntity("accounts", viewerUserId);
	revalidateForEntity("transactions", viewerUserId);

	return {
		success: true,
		message: "Transferência registrada com sucesso.",
		data: { ids: transactionIds },
	};
}
