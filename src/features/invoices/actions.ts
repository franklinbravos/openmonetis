"use server";

import { and, desc, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
	cards,
	categories,
	financialAccounts,
	importBatches,
	transactions,
} from "@/db/schema";
import { upsertInvoicePaymentStatus } from "@/features/invoices/lib/upsert-invoice-payment";
import {
	buildInvoiceAmortizationNote,
	buildInvoicePaymentNote,
	INVOICE_ADJUSTMENT_NAME,
	isInvoiceAmortizationNote,
} from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	resolveInvoicePaymentRoundingDelta,
	roundMoney,
} from "@/shared/lib/import/invoice-total";
import {
	INVOICE_PAYMENT_STATUS,
	INVOICE_STATUS_VALUES,
	type InvoicePaymentStatus,
	PERIOD_FORMAT_REGEX,
} from "@/shared/lib/invoices";
import {
	assertFinancialEditAccess,
	FinancialAccessError,
} from "@/shared/lib/payers/financial-access";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import {
	formatCurrency,
	formatDecimalForDbRequired,
} from "@/shared/utils/currency";
import {
	getBusinessTodayDate,
	parseLocalDateString,
} from "@/shared/utils/date";
import { dateToPeriod } from "@/shared/utils/period";

const isValidPaymentDate = (value: string) =>
	!Number.isNaN(parseLocalDateString(value).getTime());

function getActionErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof (error as { message: unknown }).message === "string"
	) {
		return (error as { message: string }).message;
	}
	return "Erro inesperado.";
}

const updateInvoicePaymentStatusSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	status: z.enum(
		INVOICE_STATUS_VALUES as [InvoicePaymentStatus, ...InvoicePaymentStatus[]],
	),
	paymentDate: z
		.string()
		.optional()
		.refine((value) => !value || isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
	paymentAccountId: z
		.string({ message: "Conta inválida." })
		.uuid("Conta inválida.")
		.nullable()
		.optional(),
});

type UpdateInvoicePaymentStatusInput = z.infer<
	typeof updateInvoicePaymentStatusSchema
>;

type ActionResult =
	| { success: true; message: string }
	| { success: false; error: string };

/**
 * A conta corrente é debitada pelo que o banco cobrou, e o total declarado no
 * arquivo pode ficar alguns centavos abaixo da soma dos lançamentos: parcela com
 * fração de centavo. Até dois centavos a fatura fecha pelo valor do arquivo.
 *
 * Acima disso a diferença tem causa concreta — lançamento faltando, valor errado
 * — e arredondar o pagamento esconderia o problema, então a cota fica como está.
 */
async function resolveSourceRoundingDelta(
	client: Pick<typeof db, "select" | "query">,
	input: { dataOwnerUserId: string; cardId: string; period: string },
): Promise<number> {
	const batch = await client.query.importBatches.findFirst({
		columns: { sourceInvoiceTotal: true },
		where: and(
			eq(importBatches.userId, input.dataOwnerUserId),
			eq(importBatches.cardId, input.cardId),
			eq(importBatches.invoicePeriod, input.period),
			isNotNull(importBatches.sourceInvoiceTotal),
		),
		orderBy: [desc(importBatches.createdAt)],
	});

	if (batch?.sourceInvoiceTotal == null) return 0;

	const sourceTotal = Math.abs(Number(batch.sourceInvoiceTotal));
	if (!Number.isFinite(sourceTotal) || sourceTotal === 0) return 0;

	const registeredRows = await client
		.select({ amount: transactions.amount, name: transactions.name })
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.cardId, input.cardId),
				eq(transactions.period, input.period),
			),
		);

	const registeredTotal = Math.abs(
		registeredRows.reduce(
			(total, row) =>
				row.name === INVOICE_ADJUSTMENT_NAME
					? total
					: total + Number(row.amount ?? 0),
			0,
		),
	);

	return resolveInvoicePaymentRoundingDelta({ sourceTotal, registeredTotal });
}

/**
 * Total já registrado como amortização desta fatura.
 *
 * São pagamentos que o arquivo do mês seguinte declarou e que saíram da conta
 * antes do vencimento. Contam como fatura paga, então o débito final é só o
 * resto.
 */
async function sumRegisteredAmortizations(
	client: Pick<typeof db, "query">,
	input: { dataOwnerUserId: string; cardId: string; period: string },
): Promise<number> {
	const rows = await client.query.transactions.findMany({
		columns: { amount: true, note: true },
		where: and(
			eq(transactions.userId, input.dataOwnerUserId),
			ilike(
				transactions.note,
				`${buildInvoicePaymentNote(input.cardId, input.period)}%`,
			),
		),
	});

	return roundMoney(
		rows.reduce(
			(total, row) =>
				isInvoiceAmortizationNote(row.note)
					? total + Math.abs(Number(row.amount ?? 0))
					: total,
			0,
		),
	);
}

const successMessageByStatus: Record<InvoicePaymentStatus, string> = {
	[INVOICE_PAYMENT_STATUS.PAID]: "Fatura marcada como paga.",
	[INVOICE_PAYMENT_STATUS.PENDING]: "Pagamento da fatura foi revertido.",
	[INVOICE_PAYMENT_STATUS.PARTIAL]: "Fatura marcada como paga parcialmente.",
};

export async function updateInvoicePaymentStatusAction(
	input: UpdateInvoicePaymentStatusInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = updateInvoicePaymentStatusSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true, accountId: true, name: true },
				where: and(
					eq(cards.id, data.cardId),
					eq(cards.userId, dataOwnerUserId),
				),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			await upsertInvoicePaymentStatus(tx, {
				userId: dataOwnerUserId,
				cardId: data.cardId,
				period: data.period,
				paymentStatus: data.status,
			});

			const shouldMarkAsPaid = data.status === INVOICE_PAYMENT_STATUS.PAID;

			await tx
				.update(transactions)
				.set({ isSettled: shouldMarkAsPaid })
				.where(
					and(
						eq(transactions.userId, dataOwnerUserId),
						eq(transactions.cardId, card.id),
						eq(transactions.period, data.period),
					),
				);

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);

			if (shouldMarkAsPaid) {
				// Soma no mesmo transaction — evita RPC get_invoice_admin_share
				// (cast p_admin_payer_id::uuid gerava 22P02 em alguns ambientes).
				const adminShareRows = adminPayerId
					? await tx
							.select({ amount: transactions.amount })
							.from(transactions)
							.where(
								and(
									eq(transactions.userId, dataOwnerUserId),
									eq(transactions.cardId, card.id),
									eq(transactions.period, data.period),
									eq(transactions.payerId, adminPayerId),
								),
							)
					: [];

				const adminShare = adminShareRows.reduce(
					(total, row) => total + Number(row.amount ?? 0),
					0,
				);
				const sourceRoundingDelta = await resolveSourceRoundingDelta(tx, {
					dataOwnerUserId,
					cardId: card.id,
					period: data.period,
				});
				/*
				 * Amortizações já registradas saem da conta: o que a baixa cria é o
				 * que FALTA pagar. Sem descontar, uma fatura amortizada em R$ 2.500
				 * e depois quitada somaria dois débitos e o extrato mostraria mais
				 * dinheiro saindo do que saiu.
				 */
				const amortizedTotal = await sumRegisteredAmortizations(tx, {
					dataOwnerUserId,
					cardId: card.id,
					period: data.period,
				});
				const adminPayableAmount = roundMoney(
					Math.max(
						0,
						Math.abs(Math.min(adminShare, 0)) +
							sourceRoundingDelta -
							amortizedTotal,
					),
				);
				const paymentAccountId = data.paymentAccountId ?? card.accountId;

				if (adminPayerId) {
					if (!paymentAccountId) {
						throw new Error("Selecione uma conta para pagar a fatura.");
					}

					const paymentAccount = await tx.query.financialAccounts.findFirst({
						columns: { id: true },
						where: and(
							eq(financialAccounts.id, paymentAccountId),
							eq(financialAccounts.userId, dataOwnerUserId),
						),
					});

					if (!paymentAccount) {
						throw new Error("Conta de pagamento não encontrada.");
					}

					const paymentCategory = await tx.query.categories.findFirst({
						columns: { id: true },
						where: and(
							eq(categories.userId, dataOwnerUserId),
							eq(categories.name, "Pagamentos"),
						),
					});

					const invoiceDate = data.paymentDate
						? parseLocalDateString(data.paymentDate)
						: getBusinessTodayDate();

					const amount = `-${formatDecimalForDbRequired(adminPayableAmount)}`;
					const payload = {
						condition: "À vista",
						name: `Pagamento fatura - ${card.name}`,
						paymentMethod: "Pix",
						note: invoiceNote,
						amount,
						purchaseDate: invoiceDate,
						transactionType: "Despesa" as const,
						period: data.period,
						isSettled: true,
						userId: dataOwnerUserId,
						accountId: paymentAccountId,
						categoryId: paymentCategory?.id ?? null,
						payerId: adminPayerId,
					};

					const existingPayment = await tx.query.transactions.findFirst({
						columns: { id: true },
						where: and(
							eq(transactions.userId, dataOwnerUserId),
							eq(transactions.note, invoiceNote),
						),
					});

					// Amortizações cobriram a fatura inteira: não há débito final a
					// registrar, e manter um de zero poluiria o extrato.
					if (adminPayableAmount <= 0.01) {
						if (existingPayment) {
							await tx
								.delete(transactions)
								.where(eq(transactions.id, existingPayment.id));
						}
					} else if (existingPayment) {
						await tx
							.update(transactions)
							.set(payload)
							.where(eq(transactions.id, existingPayment.id));
					} else {
						await tx.insert(transactions).values(payload);
					}
				}
			} else {
				await tx
					.delete(transactions)
					.where(
						and(
							eq(transactions.userId, dataOwnerUserId),
							eq(transactions.note, invoiceNote),
						),
					);
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: successMessageByStatus[data.status] };
	} catch (error) {
		if (error instanceof FinancialAccessError) {
			return { success: false, error: error.message };
		}

		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: getActionErrorMessage(error),
		};
	}
}

const updatePaymentDateSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	paymentDate: z
		.string({ message: "Data de pagamento inválida." })
		.refine((value) => isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
});

type UpdatePaymentDateInput = z.infer<typeof updatePaymentDateSchema>;

export async function updatePaymentDateAction(
	input: UpdatePaymentDateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = updatePaymentDateSchema.parse(input);

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(
					eq(cards.id, data.cardId),
					eq(cards.userId, dataOwnerUserId),
				),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);

			const existingPayment = await tx.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.note, invoiceNote),
				),
			});

			if (!existingPayment) {
				throw new Error("Pagamento não encontrado.");
			}

			await tx
				.update(transactions)
				.set({
					purchaseDate: parseLocalDateString(data.paymentDate),
				})
				.where(eq(transactions.id, existingPayment.id));
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Data de pagamento atualizada." };
	} catch (error) {
		if (error instanceof FinancialAccessError) {
			return { success: false, error: error.message };
		}

		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: getActionErrorMessage(error),
		};
	}
}

const adjustInvoiceSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	currentTotal: z.number({ message: "Total atual inválido." }),
	targetAmount: z
		.number({ message: "Valor inválido." })
		.nonnegative("O valor deve ser positivo."),
});

type AdjustInvoiceInput = z.infer<typeof adjustInvoiceSchema>;

export async function adjustInvoiceAction(
	input: AdjustInvoiceInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = adjustInvoiceSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		let message = "Ajuste de fatura registrado.";

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(
					eq(cards.id, data.cardId),
					eq(cards.userId, dataOwnerUserId),
				),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const existing = await tx.query.transactions.findFirst({
				columns: { id: true, amount: true },
				where: and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.cardId, data.cardId),
					eq(transactions.period, data.period),
					eq(transactions.name, INVOICE_ADJUSTMENT_NAME),
				),
			});

			const existingAmount = Number(existing?.amount ?? 0);
			const baseTotal = data.currentTotal - existingAmount;
			const targetTotal = -data.targetAmount;
			const adjustmentAmount =
				Math.round((targetTotal - baseTotal) * 100) / 100;

			if (adjustmentAmount === 0) {
				if (existing) {
					await tx.delete(transactions).where(eq(transactions.id, existing.id));
					message = "Ajuste de fatura removido.";
				} else {
					message = "Nada a ajustar — o valor já está correto.";
				}
				return;
			}

			const isExpense = adjustmentAmount < 0;
			const categoryName = isExpense ? "Outras despesas" : "Outras receitas";

			const category = await tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, dataOwnerUserId),
					eq(categories.name, categoryName),
				),
			});

			const amount = formatDecimalForDbRequired(adjustmentAmount);

			const note = `O valor era ${formatCurrency(Math.abs(baseTotal))} mas o correto é ${formatCurrency(data.targetAmount)}.`;

			const payload = {
				condition: "À vista",
				name: INVOICE_ADJUSTMENT_NAME,
				paymentMethod: "Cartão de crédito",
				note,
				amount,
				purchaseDate: getBusinessTodayDate(),
				transactionType: isExpense
					? ("Despesa" as const)
					: ("Receita" as const),
				period: data.period,
				userId: dataOwnerUserId,
				cardId: data.cardId,
				accountId: null,
				categoryId: category?.id ?? null,
				payerId: adminPayerId,
			};

			if (existing) {
				await tx
					.update(transactions)
					.set(payload)
					.where(eq(transactions.id, existing.id));
			} else {
				await tx.insert(transactions).values(payload);
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message };
	} catch (error) {
		if (error instanceof FinancialAccessError) {
			return { success: false, error: error.message };
		}

		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: getActionErrorMessage(error),
		};
	}
}

const invoiceAmortizationsSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	accountId: z
		.string({ message: "Conta inválida." })
		.uuid("Conta inválida.")
		.nullable()
		.optional(),
	payments: z.array(
		z.object({
			date: z
				.string({ message: "Data do pagamento inválida." })
				.refine((value) => isValidPaymentDate(value), {
					message: "Data do pagamento inválida.",
				}),
			amount: z.number().positive(),
		}),
	),
});

type RegisterInvoiceAmortizationsInput = z.infer<
	typeof invoiceAmortizationsSchema
>;

/**
 * Registra as amortizações desta fatura declaradas no arquivo do mês seguinte.
 *
 * Quem paga em vários dias para reduzir juros abate a fatura seguinte antes de
 * ela fechar. Esse pagamento só aparece no arquivo do mês seguinte, e até aqui
 * a importação apenas o exibia na revisão: o dinheiro saía da conta e não
 * existia lançamento nenhum. O extrato dizia que tudo saiu no vencimento.
 *
 * É uma sincronização, não um acréscimo: o que o arquivo declara passa a valer,
 * e amortização registrada antes que ele não declara mais é removida — senão
 * reprocessar um arquivo corrigido deixaria o pagamento antigo para trás.
 */
export async function registerInvoiceAmortizationsAction(
	input: RegisterInvoiceAmortizationsInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { dataOwnerUserId } = await assertFinancialEditAccess(user.id);
		const data = invoiceAmortizationsSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			return { success: true, message: "Sem pagador administrador." };
		}

		const card = await db.query.cards.findFirst({
			columns: { id: true, accountId: true, name: true },
			where: and(eq(cards.id, data.cardId), eq(cards.userId, dataOwnerUserId)),
		});

		if (!card) {
			throw new Error("Cartão não encontrado.");
		}

		const accountId = data.accountId ?? card.accountId;
		if (data.payments.length > 0 && !accountId) {
			throw new Error("Cartão sem conta para registrar o pagamento.");
		}

		const paymentCategory = await db.query.categories.findFirst({
			columns: { id: true },
			where: and(
				eq(categories.userId, dataOwnerUserId),
				eq(categories.name, "Pagamentos"),
			),
		});

		// Uma amortização por data: duas saídas no mesmo dia são o mesmo abate
		// para efeito de registro, e somá-las mantém a nota única.
		const amountByDate = new Map<string, number>();
		for (const payment of data.payments) {
			const current = amountByDate.get(payment.date) ?? 0;
			amountByDate.set(payment.date, roundMoney(current + payment.amount));
		}

		const notes = Array.from(amountByDate.keys()).map((date) =>
			buildInvoiceAmortizationNote(card.id, data.period, date),
		);

		const existingRows = await db.query.transactions.findMany({
			columns: { id: true, note: true },
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				ilike(
					transactions.note,
					`${buildInvoicePaymentNote(card.id, data.period)}%`,
				),
			),
		});

		const staleIds = existingRows
			.filter(
				(row) =>
					isInvoiceAmortizationNote(row.note) &&
					!notes.includes(row.note ?? ""),
			)
			.map((row) => row.id);

		if (staleIds.length > 0) {
			await db
				.delete(transactions)
				.where(
					and(
						eq(transactions.userId, dataOwnerUserId),
						inArray(transactions.id, staleIds),
					),
				);
		}

		for (const [date, amount] of amountByDate) {
			const note = buildInvoiceAmortizationNote(card.id, data.period, date);
			const existing = existingRows.find((row) => row.note === note);
			const payload = {
				condition: "À vista",
				name: `Pagamento fatura - ${card.name}`,
				paymentMethod: "Pix",
				note,
				amount: `-${formatDecimalForDbRequired(amount)}`,
				purchaseDate: parseLocalDateString(date),
				transactionType: "Despesa" as const,
				/*
				 * O período é o mês em que o dinheiro saiu, não o da fatura que ele
				 * abateu: o extrato da conta agrupa por período, e jogar a saída no
				 * mês da fatura reproduziria justamente o problema que este registro
				 * resolve — dinheiro que sai em maio e só aparece em junho. O
				 * vínculo com a fatura é a anotação, não o período.
				 */
				period: dateToPeriod(parseLocalDateString(date)),
				isSettled: true,
				userId: dataOwnerUserId,
				accountId,
				categoryId: paymentCategory?.id ?? null,
				payerId: adminPayerId,
			};

			if (existing) {
				await db
					.update(transactions)
					.set(payload)
					.where(eq(transactions.id, existing.id));
			} else {
				await db.insert(transactions).values(payload);
			}
		}

		revalidateForEntity("cards", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Amortizações registradas." };
	} catch (error) {
		if (error instanceof FinancialAccessError) {
			return { success: false, error: error.message };
		}

		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return { success: false, error: getActionErrorMessage(error) };
	}
}
