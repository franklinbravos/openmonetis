"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { categories, financialAccounts, transactions } from "@/db/schema";
import { upsertAccountBalanceAdjustmentInTx } from "@/features/accounts/lib/balance-adjustment";
import {
	INITIAL_BALANCE_CATEGORY_NAME,
	INITIAL_BALANCE_CONDITION,
	INITIAL_BALANCE_NOTE,
	INITIAL_BALANCE_PAYMENT_METHOD,
	INITIAL_BALANCE_TRANSACTION_TYPE,
} from "@/shared/lib/accounts/constants";
import {
	ActionError,
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { PERIOD_FORMAT_REGEX } from "@/shared/lib/invoices";
import { loadLogoOptions } from "@/shared/lib/logo/options";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { noteSchema, uuidSchema } from "@/shared/lib/schemas/common";
import {
	TRANSFER_CATEGORY_NAME,
	TRANSFER_CONDITION,
	TRANSFER_ESTABLISHMENT_ENTRADA,
	TRANSFER_ESTABLISHMENT_SAIDA,
	TRANSFER_PAYMENT_METHOD,
} from "@/shared/lib/transfers/constants";
import {
	formatDecimalForDbRequired,
} from "@/shared/utils/currency";
import {
	getBusinessTodayDate,
	getTodayInfo,
	parseLocalDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";
import { normalizeFilePath } from "@/shared/utils/string";

const ACCOUNT_YIELD_CATEGORY_NAME = "Rendimentos";
const ACCOUNT_YIELD_CATEGORY_ICON = "RiFundsLine";
const ACCOUNT_YIELD_TRANSACTION_NAME = "Rendimento";
const ACCOUNT_YIELD_CONDITION = INITIAL_BALANCE_CONDITION;
const ACCOUNT_YIELD_PAYMENT_METHOD = "Transferência bancária" as const;

const accountBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome da conta." })
		.trim()
		.min(1, "Informe o nome da conta."),
	accountType: z
		.string({ message: "Informe o tipo da conta." })
		.trim()
		.min(1, "Informe o tipo da conta."),
	status: z
		.string({ message: "Informe o status da conta." })
		.trim()
		.min(1, "Informe o status da conta."),
	note: noteSchema,
	logo: z
		.string({ message: "Selecione um logo." })
		.trim()
		.min(1, "Selecione um logo."),
	initialBalance: z.union([
		z.number(),
		z
			.string()
			.trim()
			.transform((value) =>
				value.length === 0 ? "0" : value.replace(",", "."),
			)
			.refine(
				(value) => !Number.isNaN(Number.parseFloat(value)),
				"Informe um saldo inicial válido.",
			)
			.transform((value) => Number.parseFloat(value)),
	]),
	excludeFromBalance: z
		.union([z.boolean(), z.string()])
		.transform((value) => value === true || value === "true"),
	excludeInitialBalanceFromIncome: z
		.union([z.boolean(), z.string()])
		.transform((value) => value === true || value === "true"),
});

const createAccountSchema = accountBaseSchema;
const updateAccountSchema = accountBaseSchema.extend({
	id: uuidSchema("FinancialAccount"),
});
const deleteAccountSchema = z.object({
	id: uuidSchema("FinancialAccount"),
});

type AccountCreateInput = z.infer<typeof createAccountSchema>;
type AccountUpdateInput = z.infer<typeof updateAccountSchema>;
type AccountDeleteInput = z.infer<typeof deleteAccountSchema>;

export type AccountCreateResultData = {
	id: string;
	name: string;
	accountType: string;
	logo: string | null;
};

export async function createAccountAction(
	input: AccountCreateInput,
): Promise<ActionResult<AccountCreateResultData>> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = createAccountSchema.parse(input);

		const logoFile = normalizeFilePath(data.logo);

		const normalizedInitialBalance = Math.abs(data.initialBalance);
		const hasInitialBalance = normalizedInitialBalance > 0;
		const adminPayerId = hasInitialBalance
			? await getAdminPayerId(user.id)
			: null;

		if (hasInitialBalance && !adminPayerId) {
			throw new ActionError(
				"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de definir um saldo inicial.",
			);
		}

		const createdAccount = await db.transaction(async (tx: typeof db) => {
			const [created] = await tx
				.insert(financialAccounts)
				.values({
					name: data.name,
					accountType: data.accountType,
					status: data.status,
					note: data.note ?? null,
					logo: logoFile,
					initialBalance: formatDecimalForDbRequired(data.initialBalance),
					excludeFromBalance: data.excludeFromBalance,
					excludeInitialBalanceFromIncome: data.excludeInitialBalanceFromIncome,
					userId: dataOwnerUserId,
				})
				.returning({ id: financialAccounts.id, name: financialAccounts.name });

			if (!created) {
				throw new ActionError("Não foi possível criar a conta.");
			}

			if (!hasInitialBalance) {
				return created;
			}

			const [category] = await Promise.all([
				tx.query.categories.findFirst({
					columns: { id: true },
					where: and(
						eq(categories.userId, dataOwnerUserId),
						eq(categories.name, INITIAL_BALANCE_CATEGORY_NAME),
					),
				}),
			]);

			if (!category) {
				throw new ActionError(
					'Categoria "Saldo inicial" não encontrada. Crie-a antes de definir um saldo inicial.',
				);
			}

			const { date, period } = getTodayInfo();

			await tx.insert(transactions).values({
				condition: INITIAL_BALANCE_CONDITION,
				name: `Saldo inicial - ${created.name}`,
				paymentMethod: INITIAL_BALANCE_PAYMENT_METHOD,
				note: INITIAL_BALANCE_NOTE,
				amount: formatDecimalForDbRequired(normalizedInitialBalance),
				purchaseDate: date,
				transactionType: INITIAL_BALANCE_TRANSACTION_TYPE,
				period,
				isSettled: true,
				userId: dataOwnerUserId,
				accountId: created.id,
				categoryId: category.id,
				payerId: adminPayerId,
			});

			return created;
		});

		revalidateForEntity("accounts", user.id);

		return {
			success: true,
			message: "Conta criada com sucesso.",
			data: {
				id: createdAccount.id,
				name: createdAccount.name,
				accountType: data.accountType,
				logo: logoFile,
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

export async function fetchAccountFormOptionsAction(): Promise<{
	logoOptions: string[];
}> {
	const logoOptions = await loadLogoOptions();
	return { logoOptions };
}

export async function updateAccountAction(
	input: AccountUpdateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = updateAccountSchema.parse(input);

		const logoFile = normalizeFilePath(data.logo);

		const [updated] = await db
			.update(financialAccounts)
			.set({
				name: data.name,
				accountType: data.accountType,
				status: data.status,
				note: data.note ?? null,
				logo: logoFile,
				initialBalance: formatDecimalForDbRequired(data.initialBalance),
				excludeFromBalance: data.excludeFromBalance,
				excludeInitialBalanceFromIncome: data.excludeInitialBalanceFromIncome,
			})
			.where(
				and(
					eq(financialAccounts.id, data.id),
					eq(financialAccounts.userId, dataOwnerUserId),
				),
			)
			.returning();

		if (!updated) {
			return {
				success: false,
				error: "Conta não encontrada.",
			};
		}

		revalidateForEntity("accounts", user.id);

		return {
			success: true,
			message: "Conta atualizada com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteAccountAction(
	input: AccountDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = deleteAccountSchema.parse(input);

		const [deleted] = await db
			.delete(financialAccounts)
			.where(
				and(
					eq(financialAccounts.id, data.id),
					eq(financialAccounts.userId, dataOwnerUserId),
				),
			)
			.returning({ id: financialAccounts.id });

		if (!deleted) {
			return {
				success: false,
				error: "Conta não encontrada.",
			};
		}

		revalidateForEntity("accounts", user.id);

		return {
			success: true,
			message: "Conta removida com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

// Transfer between accounts
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
	date: z.coerce.date({ message: "Informe uma data válida." }),
	period: z
		.string({ message: "Informe o período." })
		.trim()
		.min(1, "Informe o período."),
});

type TransferInput = z.input<typeof transferSchema>;

export async function transferBetweenAccountsAction(
	input: TransferInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = transferSchema.parse(input);

		// Validate that accounts are different
		if (data.fromAccountId === data.toAccountId) {
			return {
				success: false,
				error: "A conta de origem e destino devem ser diferentes.",
			};
		}

		// Generate a unique transfer ID to link both transactions
		const transferId = crypto.randomUUID();
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			throw new ActionError(
				"Pessoa administrador não encontrada. Por favor, crie uma pessoa admin.",
			);
		}

		await db.transaction(async (tx: typeof db) => {
			// Verify both accounts exist and belong to the user
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

			// Get the transfer category and admin payer in parallel
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
				purchaseDate: data.date,
				transactionType: "Transferência" as const,
				period: data.period,
				isSettled: true,
				userId: dataOwnerUserId,
				categoryId: transferCategory.id,
				payerId: adminPayerId,
				transferId,
			};

			// Create both transactions in a single batch insert
			await tx.insert(transactions).values([
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
			]);
		});

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return {
			success: true,
			message: "Transferência registrada com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

const adjustAccountBalanceSchema = z.object({
	accountId: uuidSchema("FinancialAccount"),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	currentBalance: z.number({ message: "Saldo atual inválido." }),
	targetBalance: z.number({ message: "Saldo correto inválido." }),
	purchaseDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
		.optional(),
});

type AdjustAccountBalanceInput = z.infer<typeof adjustAccountBalanceSchema>;

const addAccountYieldSchema = z.object({
	accountId: uuidSchema("FinancialAccount"),
	amount: z
		.number({ message: "Valor inválido." })
		.positive("Informe um valor maior que zero."),
	date: z
		.string({ message: "Data inválida." })
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida."),
});

type AddAccountYieldInput = z.infer<typeof addAccountYieldSchema>;

export async function addAccountYieldAction(
	input: AddAccountYieldInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = addAccountYieldSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			throw new ActionError(
				"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de adicionar rendimentos.",
			);
		}

		const purchaseDate = parseLocalDateString(data.date);
		if (Number.isNaN(purchaseDate.getTime())) {
			throw new ActionError("Data inválida.");
		}

		await db.transaction(async (tx: typeof db) => {
			const account = await tx.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.accountId),
					eq(financialAccounts.userId, dataOwnerUserId),
				),
			});

			if (!account) {
				throw new ActionError("Conta não encontrada.");
			}

			const existingCategory = await tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, dataOwnerUserId),
					eq(categories.type, "receita"),
					eq(categories.name, ACCOUNT_YIELD_CATEGORY_NAME),
				),
			});

			const category =
				existingCategory ??
				(
					await tx
						.insert(categories)
						.values({
							name: ACCOUNT_YIELD_CATEGORY_NAME,
							type: "receita",
							icon: ACCOUNT_YIELD_CATEGORY_ICON,
							userId: dataOwnerUserId,
						})
						.returning({ id: categories.id })
				)[0];

			if (!category) {
				throw new ActionError(
					"Não foi possível preparar a categoria de rendimentos.",
				);
			}

			await tx.insert(transactions).values({
				condition: ACCOUNT_YIELD_CONDITION,
				name: ACCOUNT_YIELD_TRANSACTION_NAME,
				paymentMethod: ACCOUNT_YIELD_PAYMENT_METHOD,
				note: null,
				amount: formatDecimalForDbRequired(data.amount),
				purchaseDate,
				transactionType: "Receita" as const,
				period: derivePeriodFromDate(data.date),
				isSettled: true,
				userId: dataOwnerUserId,
				accountId: data.accountId,
				cardId: null,
				categoryId: category.id,
				payerId: adminPayerId,
			});
		});

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Rendimento adicionado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function adjustAccountBalanceAction(
	input: AdjustAccountBalanceInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = adjustAccountBalanceSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			throw new ActionError(
				"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de ajustar o saldo.",
			);
		}

		let message = "Ajuste de saldo registrado.";

		await db.transaction(async (tx: typeof db) => {
			const account = await tx.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.accountId),
					eq(financialAccounts.userId, dataOwnerUserId),
				),
			});

			if (!account) {
				throw new ActionError("Conta não encontrada.");
			}

			const purchaseDate =
				data.purchaseDate ?? toDateOnlyString(getBusinessTodayDate());
			if (!purchaseDate) {
				throw new ActionError("Data do ajuste inválida.");
			}

			const result = await upsertAccountBalanceAdjustmentInTx(tx, {
				dataOwnerUserId,
				accountId: data.accountId,
				period: data.period,
				purchaseDate,
				currentBalance: data.currentBalance,
				targetBalance: data.targetBalance,
				adminPayerId,
			});
			message = result.message;
		});

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message };
	} catch (error) {
		return handleActionError(error);
	}
}
