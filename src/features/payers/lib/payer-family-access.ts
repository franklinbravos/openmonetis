import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { payerShares, payers, user } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	PAYER_ROLE_ADMIN,
	type PayerSharePermission,
} from "@/shared/lib/payers/constants";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";

export type PayerLoginLink = {
	loginEmail: string | null;
	loginUserName: string | null;
	familyAccessActive: boolean;
};

async function findUserByEmail(email: string) {
	return db.query.user.findFirst({
		where: eq(user.email, email.toLowerCase()),
	});
}

async function upsertShareForUser(input: {
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

export async function syncFamilyAccessForLoginEmail(
	ownerUserId: string,
	email: string | null,
	permission: PayerSharePermission = "edit",
): Promise<{ userFound: boolean; linked: boolean }> {
	const normalizedEmail = email?.trim().toLowerCase();
	if (!normalizedEmail) {
		return { userFound: false, linked: false };
	}

	const adminPayerId = await getAdminPayerId(ownerUserId);
	if (!adminPayerId) {
		return { userFound: false, linked: false };
	}

	const existingUser = await findUserByEmail(normalizedEmail);
	if (!existingUser) {
		return { userFound: false, linked: false };
	}

	if (existingUser.id === ownerUserId) {
		return { userFound: true, linked: false };
	}

	await upsertShareForUser({
		payerId: adminPayerId,
		sharedWithUserId: existingUser.id,
		permission,
		createdByUserId: ownerUserId,
	});

	return { userFound: true, linked: true };
}

export async function findFamilyAdminPayer() {
	return db.query.payers.findFirst({
		columns: {
			id: true,
			userId: true,
		},
		where: eq(payers.role, PAYER_ROLE_ADMIN),
		orderBy: (payer, { asc }) => [asc(payer.createdAt)],
	});
}

export async function bootstrapFamilyAccessForUser(input: {
	id: string;
	email: string | null;
}): Promise<{ linked: boolean }> {
	const familyAdmin = await findFamilyAdminPayer();
	if (!familyAdmin || familyAdmin.userId === input.id) {
		return { linked: false };
	}

	await upsertShareForUser({
		payerId: familyAdmin.id,
		sharedWithUserId: input.id,
		permission: "edit",
		createdByUserId: familyAdmin.userId,
	});

	if (input.email) {
		await syncFamilyAccessForLoginEmail(familyAdmin.userId, input.email);
	}

	return { linked: true };
}

type PayerLoginInput = {
	id: string;
	role: string | null;
	email: string | null;
	userId: string;
};

export async function buildPayerLoginLinks(
	viewerUserId: string,
	payersInput: PayerLoginInput[],
): Promise<Map<string, PayerLoginLink>> {
	const result = new Map<string, PayerLoginLink>();
	const adminPayerId = await getAdminPayerId(viewerUserId);

	const adminOwnerIds = [
		...new Set(
			payersInput
				.filter((payer) => payer.role === PAYER_ROLE_ADMIN)
				.map((payer) => payer.userId),
		),
	];

	const thirdPartyEmails = [
		...new Set(
			payersInput
				.filter(
					(payer) => payer.role !== PAYER_ROLE_ADMIN && payer.email?.trim(),
				)
				.map((payer) => payer.email!.trim().toLowerCase()),
		),
	];

	const [ownerUsers, shareRows, emailUsers] = await Promise.all([
		adminOwnerIds.length > 0
			? db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
					})
					.from(user)
					.where(inArray(user.id, adminOwnerIds))
			: Promise.resolve([]),
		adminPayerId
			? db
					.select({
						sharedWithUserId: payerShares.sharedWithUserId,
					})
					.from(payerShares)
					.where(eq(payerShares.payerId, adminPayerId))
			: Promise.resolve([]),
		thirdPartyEmails.length > 0
			? db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
					})
					.from(user)
					.where(
						// `lower(email) = x` não é traduzível para PostgREST; `ilike`
						// compara sem caixa e a igualdade é reconfirmada abaixo.
						or(...thirdPartyEmails.map((email) => ilike(user.email, email))),
					)
			: Promise.resolve([]),
	]);

	const sharedUserIds = [
		...new Set(shareRows.map((entry) => entry.sharedWithUserId)),
	];
	const shareUsers =
		sharedUserIds.length > 0
			? await db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
					})
					.from(user)
					.where(inArray(user.id, sharedUserIds))
			: [];

	const ownerById = new Map(ownerUsers.map((entry) => [entry.id, entry]));
	const shareByUserId = new Map(shareUsers.map((entry) => [entry.id, entry]));
	const userByEmail = new Map(
		emailUsers.flatMap((entry) =>
			entry.email ? [[entry.email.toLowerCase(), entry] as const] : [],
		),
	);

	for (const payer of payersInput) {
		if (payer.role === PAYER_ROLE_ADMIN) {
			const owner = ownerById.get(payer.userId);
			result.set(payer.id, {
				loginEmail: owner?.email ?? payer.email,
				loginUserName: owner?.name ?? null,
				familyAccessActive: true,
			});
			continue;
		}

		const normalizedEmail = payer.email?.trim().toLowerCase() ?? null;
		const matchedUser = normalizedEmail
			? userByEmail.get(normalizedEmail)
			: null;
		const share = matchedUser ? shareByUserId.get(matchedUser.id) : null;

		result.set(payer.id, {
			loginEmail: normalizedEmail ?? payer.email,
			loginUserName: matchedUser?.name ?? share?.name ?? null,
			familyAccessActive: Boolean(matchedUser && share),
		});
	}

	return result;
}
