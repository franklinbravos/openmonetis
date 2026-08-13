"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { payerShareInvites, payerShares, payers, user } from "@/db/schema";
import {
	buildInviteUrl,
	generateInviteToken,
	generateTemporaryPassword,
	getInviteExpiryDate,
	hashInviteToken,
} from "@/features/payers/lib/share-invites";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { createEmailUser } from "@/shared/lib/auth/password";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { assertPayerShareManagement } from "@/shared/lib/payers/access";
import {
	PAYER_SHARE_PERMISSIONS,
	type PayerSharePermission,
} from "@/shared/lib/payers/constants";
import { uuidSchema } from "@/shared/lib/schemas/common";
import type { ActionResult } from "@/shared/lib/types/actions";

const permissionSchema = z.enum(PAYER_SHARE_PERMISSIONS);

const createAccessSchema = z.discriminatedUnion("accessType", [
	z.object({
		payerId: uuidSchema("Payer"),
		email: z.string().trim().email("Informe um e-mail válido."),
		permission: permissionSchema,
		accessType: z.literal("magic_link"),
	}),
	z.object({
		payerId: uuidSchema("Payer"),
		email: z.string().trim().email("Informe um e-mail válido."),
		permission: permissionSchema,
		accessType: z.literal("credentials"),
		password: z
			.string()
			.min(7, "A senha deve ter pelo menos 7 caracteres.")
			.max(23, "A senha deve ter no máximo 23 caracteres.")
			.optional(),
		mustChangePassword: z.boolean().default(true),
	}),
]);

const updatePermissionSchema = z.object({
	shareId: uuidSchema("Compartilhamento"),
	permission: permissionSchema,
});

const grantExistingUserAccessSchema = z.object({
	payerId: uuidSchema("Payer"),
	email: z.string().trim().email("Informe um e-mail válido."),
	permission: permissionSchema,
});

const acceptInviteSchema = z.object({
	token: z.string().trim().min(8, "Convite inválido."),
});

const invitePreviewSchema = z.object({
	token: z.string().trim().min(8, "Convite inválido."),
});

type CreateAccessInput = z.infer<typeof createAccessSchema>;
type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

const revalidatePayer = (userId: string, payerId: string) => {
	revalidateForEntity("payers", userId);
	revalidatePath(`/payers/${payerId}`);
};

async function findUserByEmail(email: string) {
	return db.query.user.findFirst({
		where: eq(user.email, email.toLowerCase()),
	});
}

async function createShareForUser(input: {
	payerId: string;
	sharedWithUserId: string;
	permission: PayerSharePermission;
	createdByUserId: string;
}) {
	const existingShare = await db.query.payerShares.findFirst({
		where: and(
			eq(payerShares.payerId, input.payerId),
			eq(payerShares.sharedWithUserId, input.sharedWithUserId),
		),
	});

	if (existingShare) {
		await db
			.update(payerShares)
			.set({ permission: input.permission })
			.where(eq(payerShares.id, existingShare.id));
		return existingShare.id;
	}

	const [created] = await db
		.insert(payerShares)
		.values({
			payerId: input.payerId,
			sharedWithUserId: input.sharedWithUserId,
			permission: input.permission,
			createdByUserId: input.createdByUserId,
		})
		.returning({ id: payerShares.id });

	return created.id;
}

export async function grantPayerAccessToExistingUserAction(
	input: z.infer<typeof grantExistingUserAccessSchema>,
): Promise<ActionResult> {
	try {
		const currentUser = await getUser();
		const data = grantExistingUserAccessSchema.parse(input);
		const email = data.email.toLowerCase();

		const management = await assertPayerShareManagement(
			currentUser.id,
			data.payerId,
		);
		if (!management.ok) {
			return { success: false, error: management.error };
		}

		const pagador = management.pagador;
		if (pagador.email?.toLowerCase() === email) {
			return {
				success: false,
				error: "Use o e-mail de outra pessoa para conceder acesso.",
			};
		}

		const existingUser = await findUserByEmail(email);
		if (!existingUser) {
			return {
				success: false,
				error:
					"Nenhuma conta encontrada com este e-mail. A pessoa precisa criar acesso em /signup antes de receber permissão.",
			};
		}

		if (existingUser.id === pagador.userId) {
			return {
				success: false,
				error: "Esta pessoa já é a proprietária do cadastro.",
			};
		}

		await createShareForUser({
			payerId: data.payerId,
			sharedWithUserId: existingUser.id,
			permission: data.permission,
			createdByUserId: pagador.userId,
		});

		revalidatePayer(currentUser.id, data.payerId);
		revalidateForEntity("payers", existingUser.id);

		return {
			success: true,
			message: "Acesso concedido com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function createPayerAccessAction(
	input: CreateAccessInput,
): Promise<
	| ActionResult
	| {
			success: true;
			message: string;
			inviteUrl?: string;
			temporaryPassword?: string;
	  }
> {
	try {
		const currentUser = await getUser();
		const data = createAccessSchema.parse(input);
		const email = data.email.toLowerCase();

		const management = await assertPayerShareManagement(
			currentUser.id,
			data.payerId,
		);
		if (!management.ok) {
			return { success: false, error: management.error };
		}

		const pagador = management.pagador;
		if (pagador.email?.toLowerCase() === email) {
			return {
				success: false,
				error: "Use o e-mail de outra pessoa para conceder acesso.",
			};
		}

		if (data.accessType === "magic_link") {
			const token = generateInviteToken();
			await db.insert(payerShareInvites).values({
				payerId: data.payerId,
				email,
				permission: data.permission,
				inviteType: "magic_link",
				tokenHash: hashInviteToken(token),
				mustChangePassword: false,
				expiresAt: getInviteExpiryDate(),
				createdByUserId: currentUser.id,
			});

			revalidatePayer(currentUser.id, data.payerId);

			return {
				success: true,
				message: "Link de acesso gerado com sucesso.",
				inviteUrl: buildInviteUrl(token),
			};
		}

		const existingUser = await findUserByEmail(email);

		const password = data.password?.trim() || generateTemporaryPassword();
		const mustChangePassword = data.mustChangePassword ?? true;

		if (existingUser) {
			if (existingUser.id === pagador.userId) {
				return {
					success: false,
					error: "Esta pessoa já é a proprietária do cadastro.",
				};
			}

			await createShareForUser({
				payerId: data.payerId,
				sharedWithUserId: existingUser.id,
				permission: data.permission,
				createdByUserId: pagador.userId,
			});

			revalidatePayer(currentUser.id, data.payerId);
			revalidateForEntity("payers", existingUser.id);

			return {
				success: true,
				message: "Usuário já existia. Acesso concedido com sucesso.",
			};
		}

		// Sempre registra convite pendente para liberar signup quando DISABLE_SIGNUP=true
		await db.insert(payerShareInvites).values({
			payerId: data.payerId,
			email,
			permission: data.permission,
			inviteType: "credentials",
			tokenHash: hashInviteToken(generateInviteToken()),
			mustChangePassword,
			expiresAt: getInviteExpiryDate(),
			createdByUserId: currentUser.id,
		});

		const signUpUser = await createEmailUser({
			email,
			password,
			name: pagador.name,
			mustChangePassword,
		});

		if (!signUpUser?.id) {
			return {
				success: false,
				error: "Não foi possível criar o usuário de acesso.",
			};
		}

		if (mustChangePassword) {
			await db
				.update(user)
				.set({ mustChangePassword: true })
				.where(eq(user.id, signUpUser.id));
		}

		await createShareForUser({
			payerId: data.payerId,
			sharedWithUserId: signUpUser.id,
			permission: data.permission,
			createdByUserId: pagador.userId,
		});

		await db
			.update(payerShareInvites)
			.set({ acceptedAt: new Date() })
			.where(
				and(
					eq(payerShareInvites.payerId, data.payerId),
					eq(payerShareInvites.email, email),
					isNull(payerShareInvites.acceptedAt),
				),
			);

		revalidatePayer(currentUser.id, data.payerId);
		revalidateForEntity("payers", signUpUser.id);

		return {
			success: true,
			message: "Usuário de acesso criado com sucesso.",
			temporaryPassword: data.password ? undefined : password,
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function updatePayerSharePermissionAction(
	input: UpdatePermissionInput,
): Promise<ActionResult> {
	try {
		const currentUser = await getUser();
		const data = updatePermissionSchema.parse(input);

		const share = await db.query.payerShares.findFirst({
			where: eq(payerShares.id, data.shareId),
			with: {
				payer: {
					columns: {
						id: true,
						userId: true,
					},
				},
			},
		});

		if (!share?.payer) {
			return { success: false, error: "Compartilhamento não encontrado." };
		}

		const management = await assertPayerShareManagement(
			currentUser.id,
			share.payer.id,
		);
		if (!management.ok) {
			return { success: false, error: management.error };
		}

		await db
			.update(payerShares)
			.set({ permission: data.permission })
			.where(eq(payerShares.id, data.shareId));

		revalidatePayer(currentUser.id, share.payer.id);
		revalidateForEntity("payers", share.sharedWithUserId);

		return { success: true, message: "Permissão atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function getPayerInvitePreviewAction(
	input: AcceptInviteInput,
): Promise<
	| { success: false; error: string }
	| {
			success: true;
			payerName: string;
			email: string;
			permission: PayerSharePermission;
			expired: boolean;
	  }
> {
	try {
		const data = invitePreviewSchema.parse(input);
		const invite = await db.query.payerShareInvites.findFirst({
			where: eq(payerShareInvites.tokenHash, hashInviteToken(data.token)),
			with: {
				payer: {
					columns: {
						name: true,
					},
				},
			},
		});

		if (!invite || invite.acceptedAt) {
			return { success: false, error: "Convite inválido ou já utilizado." };
		}

		return {
			success: true,
			payerName: invite.payer?.name ?? "Pessoa",
			email: invite.email,
			permission: invite.permission as PayerSharePermission,
			expired: invite.expiresAt.getTime() < Date.now(),
		};
	} catch {
		return { success: false, error: "Convite inválido." };
	}
}

export async function acceptPayerInviteAction(
	input: AcceptInviteInput,
): Promise<ActionResult> {
	try {
		const currentUser = await getUser();
		const data = acceptInviteSchema.parse(input);

		const invite = await db.query.payerShareInvites.findFirst({
			where: eq(payerShareInvites.tokenHash, hashInviteToken(data.token)),
			with: {
				payer: {
					columns: {
						id: true,
						userId: true,
						name: true,
					},
				},
			},
		});

		if (!invite || invite.acceptedAt) {
			return { success: false, error: "Convite inválido ou já utilizado." };
		}

		if (invite.expiresAt.getTime() < Date.now()) {
			return { success: false, error: "Este convite expirou." };
		}

		if (currentUser.email?.toLowerCase() !== invite.email.toLowerCase()) {
			return {
				success: false,
				error: "Entre com o e-mail convidado para aceitar o acesso.",
			};
		}

		if (!invite.payer) {
			return { success: false, error: "Pessoa não encontrada." };
		}

		if (invite.payer.userId === currentUser.id) {
			return {
				success: false,
				error: "Você já é o proprietário desta pessoa.",
			};
		}

		await createShareForUser({
			payerId: invite.payer.id,
			sharedWithUserId: currentUser.id,
			permission: invite.permission as PayerSharePermission,
			createdByUserId: invite.createdByUserId,
		});

		await db
			.update(payerShareInvites)
			.set({ acceptedAt: new Date() })
			.where(eq(payerShareInvites.id, invite.id));

		revalidateForEntity("payers", currentUser.id);
		revalidatePayer(invite.createdByUserId, invite.payer.id);

		return {
			success: true,
			message: `Acesso a ${invite.payer.name} concedido com sucesso.`,
		};
	} catch (error) {
		return handleActionError(error);
	}
}
