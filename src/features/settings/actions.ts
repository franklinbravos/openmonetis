"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiTokens, payers } from "@/db/schema";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import {
	createEmailUser,
	setPassword,
	updateEmail,
	updatePassword,
	userUsesGoogleAuth,
	verifyCurrentPassword,
} from "@/shared/lib/auth/password";
import { getUser } from "@/shared/lib/auth/server";
import { DEFAULT_CATEGORIES } from "@/shared/lib/categories/defaults";
import { db, schema } from "@/shared/lib/db";
import {
	DEFAULT_PAYER_AVATAR,
	PAYER_ROLE_ADMIN,
	PAYER_STATUS_OPTIONS,
} from "@/shared/lib/payers/constants";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { generateShareCode } from "@/shared/lib/payers/share-code";
import { normalizeNameFromEmail } from "@/shared/lib/payers/utils";
import { deleteS3Object } from "@/shared/lib/storage/presign";

type ActionResponse<T = void> = {
	success: boolean;
	message?: string;
	error?: string;
	data?: T;
};

// Schema de validação
const updateNameSchema = z.object({
	firstName: z.string().min(1, "Primeiro nome é obrigatório"),
	lastName: z.string().min(1, "Sobrenome é obrigatório"),
});

const updatePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Senha atual é obrigatória"),
		newPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "As senhas não coincidem",
		path: ["confirmPassword"],
	});

const updateEmailSchema = z
	.object({
		password: z.string().optional(), // Opcional para usuários Google OAuth
		newEmail: z.string().email("E-mail inválido"),
		confirmEmail: z.string().email("E-mail inválido"),
	})
	.refine((data) => data.newEmail === data.confirmEmail, {
		message: "Os e-mails não coincidem",
		path: ["confirmEmail"],
	});

const deleteAccountSchema = z.object({
	confirmation: z.literal("DELETAR"),
});

const resetAccountSchema = z.object({
	confirmation: z.literal("ZERAR"),
});

const updatePreferencesSchema = z.object({
	statementNoteAsColumn: z.boolean(),
	transactionsColumnOrder: z.array(z.string()).nullable(),
	attachmentMaxSizeMb: z.number().int().min(1).max(100),
	showTransactionSummary: z.boolean(),
	groupTransactionsByDate: z.boolean(),
	hideAnticipatedInstallments: z.boolean(),
});

type ResettableUser = {
	name: string | null;
	email: string | null;
	image: string | null;
};

async function resetUserAppData(
	userId: string,
	user: ResettableUser,
): Promise<void> {
	const payerName =
		(user.name && user.name.trim().length > 0
			? user.name.trim()
			: normalizeNameFromEmail(user.email)) || "Pessoa principal";
	const avatarUrl = user.image ?? DEFAULT_PAYER_AVATAR;
	const defaultPayerStatus = PAYER_STATUS_OPTIONS[0];

	const userAttachments = await db
		.select({ id: schema.attachments.id, fileKey: schema.attachments.fileKey })
		.from(schema.attachments)
		.where(eq(schema.attachments.userId, userId));

	await db.transaction(async (tx: typeof db) => {
		await tx
			.delete(schema.payerShares)
			.where(
				or(
					eq(schema.payerShares.sharedWithUserId, userId),
					eq(schema.payerShares.createdByUserId, userId),
				),
			);

		await tx
			.delete(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, userId));
		await tx
			.delete(schema.apiTokens)
			.where(eq(schema.apiTokens.userId, userId));
		await tx
			.delete(schema.savedInsights)
			.where(eq(schema.savedInsights.userId, userId));
		await tx.delete(schema.notes).where(eq(schema.notes.userId, userId));
		await tx
			.delete(schema.inboxItems)
			.where(eq(schema.inboxItems.userId, userId));
		await tx.delete(schema.budgets).where(eq(schema.budgets.userId, userId));
		await tx
			.delete(schema.installmentAnticipations)
			.where(eq(schema.installmentAnticipations.userId, userId));
		await tx
			.delete(schema.transactions)
			.where(eq(schema.transactions.userId, userId));
		await tx
			.delete(schema.attachments)
			.where(eq(schema.attachments.userId, userId));
		await tx.delete(schema.invoices).where(eq(schema.invoices.userId, userId));
		await tx.delete(schema.cards).where(eq(schema.cards.userId, userId));
		await tx
			.delete(schema.financialAccounts)
			.where(eq(schema.financialAccounts.userId, userId));
		await tx.delete(schema.payers).where(eq(schema.payers.userId, userId));
		await tx
			.delete(schema.categories)
			.where(eq(schema.categories.userId, userId));

		if (DEFAULT_CATEGORIES.length > 0) {
			await tx.insert(schema.categories).values(
				DEFAULT_CATEGORIES.map((category) => ({
					name: category.name,
					type: category.type,
					icon: category.icon,
					userId,
				})),
			);
		}

		await tx.insert(schema.payers).values({
			name: payerName,
			email: user.email,
			avatarUrl,
			status: defaultPayerStatus,
			note: null,
			role: PAYER_ROLE_ADMIN,
			isAutoSend: false,
			shareCode: generateShareCode(),
			userId,
		});
	});

	await Promise.all(
		userAttachments.map((att) =>
			deleteS3Object(att.fileKey).catch((err) => {
				console.error("Falha ao remover anexo do S3 no reset:", err);
			}),
		),
	);
}

// Actions

export async function updateNameAction(
	data: z.infer<typeof updateNameSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		const validated = updateNameSchema.parse(data);
		const fullName = `${validated.firstName} ${validated.lastName}`;
		const adminPayerId = await getAdminPayerId(user.id);

		// Atualizar nome do usuário
		await db
			.update(schema.user)
			.set({ name: fullName })
			.where(eq(schema.user.id, user.id));

		// Sincronizar nome com o pessoa admin
		if (adminPayerId) {
			await db
				.update(payers)
				.set({ name: fullName })
				.where(and(eq(payers.userId, user.id), eq(payers.id, adminPayerId)));
		}

		// Revalidar o layout do dashboard para atualizar a sidebar
		revalidatePath("/", "layout");
		revalidatePath("/payers");

		return {
			success: true,
			message: "Nome atualizado com sucesso",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao atualizar nome:", error);
		return {
			success: false,
			error: "Erro ao atualizar nome. Tente novamente.",
		};
	}
}

export async function updatePasswordAction(
	data: z.infer<typeof updatePasswordSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		if (!user.email) {
			return {
				success: false,
				error: "Não autenticado",
			};
		}

		const validated = updatePasswordSchema.parse(data);

		if (await userUsesGoogleAuth(user.id)) {
			return {
				success: false,
				error:
					"Não é possível alterar senha para contas autenticadas via Google",
			};
		}

		const result = await updatePassword(
			user.email,
			validated.currentPassword,
			validated.newPassword,
		);

		if (!result.ok) {
			return {
				success: false,
				error: result.error,
			};
		}

		return {
			success: true,
			message: "Senha atualizada com sucesso",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao atualizar senha:", error);
		return {
			success: false,
			error: "Erro ao atualizar senha. Tente novamente.",
		};
	}
}

const requiredPasswordChangeSchema = z
	.object({
		newPassword: z
			.string()
			.min(7, "A senha deve ter pelo menos 7 caracteres.")
			.max(23, "A senha deve ter no máximo 23 caracteres."),
		confirmPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "As senhas não coincidem.",
		path: ["confirmPassword"],
	});

export async function completeRequiredPasswordChangeAction(
	data: z.infer<typeof requiredPasswordChangeSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		const validated = requiredPasswordChangeSchema.parse(data);

		await setPassword(validated.newPassword);

		await db
			.update(schema.user)
			.set({ mustChangePassword: false })
			.where(eq(schema.user.id, user.id));

		revalidatePath("/", "layout");

		return {
			success: true,
			message: "Senha atualizada com sucesso.",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao definir senha obrigatória:", error);
		return {
			success: false,
			error: "Não foi possível atualizar a senha.",
		};
	}
}

export async function updateEmailAction(
	data: z.infer<typeof updateEmailSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		if (!user.email) {
			return {
				success: false,
				error: "Não autenticado",
			};
		}

		const validated = updateEmailSchema.parse(data);
		const isGoogleAuth = await userUsesGoogleAuth(user.id);

		if (!isGoogleAuth) {
			if (!validated.password) {
				return {
					success: false,
					error: "Senha é obrigatória para confirmar a alteração",
				};
			}

			const isValid = await verifyCurrentPassword(
				user.email,
				validated.password,
			);

			if (!isValid) {
				return {
					success: false,
					error: "Senha incorreta",
				};
			}
		}

		const existingUser = await db.query.user.findFirst({
			where: and(
				eq(schema.user.email, validated.newEmail),
				ne(schema.user.id, user.id),
			),
		});

		if (existingUser) {
			return {
				success: false,
				error: "Este e-mail já está em uso",
			};
		}

		if (validated.newEmail.toLowerCase() === user.email.toLowerCase()) {
			return {
				success: false,
				error: "O novo e-mail deve ser diferente do atual",
			};
		}

		await updateEmail(validated.newEmail);

		await db
			.update(schema.user)
			.set({
				email: validated.newEmail,
				emailVerified: false,
			})
			.where(eq(schema.user.id, user.id));

		// Revalidar o layout do dashboard para atualizar a sidebar
		revalidatePath("/", "layout");

		return {
			success: true,
			message:
				"E-mail atualizado com sucesso. Por favor, verifique seu novo e-mail.",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao atualizar e-mail:", error);
		return {
			success: false,
			error: "Erro ao atualizar e-mail. Tente novamente.",
		};
	}
}

export async function deleteAccountAction(
	data: z.infer<typeof deleteAccountSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		// Validar confirmação
		deleteAccountSchema.parse(data);

		// Deletar todos os dados do usuário em cascade
		// O schema deve ter as relações configuradas com onDelete: cascade
		await db.delete(schema.user).where(eq(schema.user.id, user.id));

		return {
			success: true,
			message: "Conta deletada com sucesso.",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao deletar financialAccount:", error);
		return {
			success: false,
			error: "Erro ao deletar conta. Tente novamente.",
		};
	}
}

export async function resetAccountAction(
	data: z.infer<typeof resetAccountSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		resetAccountSchema.parse(data);

		const currentUser = await db.query.user.findFirst({
			columns: {
				name: true,
				email: true,
				image: true,
			},
			where: eq(schema.user.id, user.id),
		});

		if (!currentUser) {
			return {
				success: false,
				error: "Usuário não encontrado.",
			};
		}

		await resetUserAppData(user.id, currentUser);

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("cards", user.id);
		revalidateForEntity("categories", user.id);
		revalidateForEntity("budgets", user.id);
		revalidateForEntity("payers", user.id);
		revalidateForEntity("notes", user.id);
		revalidateForEntity("transactions", user.id);
		revalidateForEntity("inbox", user.id);
		revalidatePath("/settings");
		revalidatePath("/insights");
		revalidatePath("/reports");
		revalidatePath("/calendar");
		revalidatePath("/", "layout");

		return {
			success: true,
			message: "Conta zerada com sucesso.",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao zerar conta:", error);
		return {
			success: false,
			error: "Erro ao zerar conta. Tente novamente.",
		};
	}
}

export async function updatePreferencesAction(
	data: z.infer<typeof updatePreferencesSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		const validated = updatePreferencesSchema.parse(data);

		// Check if preferences exist, if not create them
		const existingResult = await db
			.select()
			.from(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, user.id))
			.limit(1);

		const existing = existingResult[0] || null;

		if (existing) {
			// Update existing preferences
			await db
				.update(schema.userPreferences)
				.set({
					statementNoteAsColumn: validated.statementNoteAsColumn,
					transactionsColumnOrder: validated.transactionsColumnOrder,
					attachmentMaxSizeMb: validated.attachmentMaxSizeMb,
					showTransactionSummary: validated.showTransactionSummary,
					groupTransactionsByDate: validated.groupTransactionsByDate,
					hideAnticipatedInstallments: validated.hideAnticipatedInstallments,
					updatedAt: new Date(),
				})
				.where(eq(schema.userPreferences.userId, user.id));
		} else {
			// Create new preferences
			await db.insert(schema.userPreferences).values({
				userId: user.id,
				statementNoteAsColumn: validated.statementNoteAsColumn,
				transactionsColumnOrder: validated.transactionsColumnOrder,
				attachmentMaxSizeMb: validated.attachmentMaxSizeMb,
				showTransactionSummary: validated.showTransactionSummary,
				groupTransactionsByDate: validated.groupTransactionsByDate,
				hideAnticipatedInstallments: validated.hideAnticipatedInstallments,
			});
		}

		// Revalidar o layout do dashboard
		revalidatePath("/", "layout");

		return {
			success: true,
			message: "Preferências atualizadas com sucesso",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao atualizar preferências:", error);
		return {
			success: false,
			error: "Erro ao atualizar preferências. Tente novamente.",
		};
	}
}

// API Token Actions

const createApiTokenSchema = z.object({
	name: z.string().min(1, "Nome do dispositivo é obrigatório").max(100),
});

const revokeApiTokenSchema = z.object({
	tokenId: z.string().uuid("ID do token inválido"),
});

function generateSecureToken(): string {
	const prefix = "opm";
	const randomPart = randomBytes(32).toString("base64url");
	return `${prefix}_${randomPart}`;
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export async function createApiTokenAction(
	data: z.infer<typeof createApiTokenSchema>,
): Promise<ActionResponse<{ token: string; tokenId: string }>> {
	try {
		const user = await getUser();

		const validated = createApiTokenSchema.parse(data);

		// Generate token
		const token = generateSecureToken();
		const tokenHash = hashToken(token);
		const tokenPrefix = token.substring(0, 10);

		// Save to database
		const [newToken] = await db
			.insert(apiTokens)
			.values({
				userId: user.id,
				name: validated.name,
				tokenHash,
				tokenPrefix,
				expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
			})
			.returning({ id: apiTokens.id });

		revalidatePath("/settings");

		return {
			success: true,
			message: "Token criado com sucesso",
			data: {
				token,
				tokenId: newToken.id,
			},
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao criar token:", error);
		return {
			success: false,
			error: "Erro ao criar token. Tente novamente.",
		};
	}
}

export async function revokeApiTokenAction(
	data: z.infer<typeof revokeApiTokenSchema>,
): Promise<ActionResponse> {
	try {
		const user = await getUser();

		const validated = revokeApiTokenSchema.parse(data);

		// Find token and verify ownership
		const [existingToken] = await db
			.select()
			.from(apiTokens)
			.where(
				and(
					eq(apiTokens.id, validated.tokenId),
					eq(apiTokens.userId, user.id),
					isNull(apiTokens.revokedAt),
				),
			)
			.limit(1);

		if (!existingToken) {
			return {
				success: false,
				error: "Token não encontrado",
			};
		}

		// Revoke token
		await db
			.update(apiTokens)
			.set({
				revokedAt: new Date(),
			})
			.where(
				and(eq(apiTokens.id, validated.tokenId), eq(apiTokens.userId, user.id)),
			);

		revalidatePath("/settings");

		return {
			success: true,
			message: "Token revogado com sucesso",
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message || "Dados inválidos",
			};
		}

		console.error("Erro ao revogar token:", error);
		return {
			success: false,
			error: "Erro ao revogar token. Tente novamente.",
		};
	}
}
