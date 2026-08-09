import { and, eq } from "drizzle-orm";
import { payerShares, payers } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	type PayerSharePermission,
	resolvePayerSharePermission,
} from "@/shared/lib/payers/constants";
import {
	resolveOwnerAccess,
	resolveSharedAccess,
} from "@/shared/lib/payers/share-permissions";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";

type PayerWithAccess = Omit<typeof payers.$inferSelect, "shareCode"> & {
	shareCode: string | null;
	canEdit: boolean;
	canManageShares: boolean;
	sharePermission: PayerSharePermission | null;
	sharedByName: string | null;
	sharedByEmail: string | null;
	shareId: string | null;
};

type SharedShareRow = {
	id: string;
	permission: string;
	pagador_id: string;
	pagadores: {
		user_id: string;
		user: {
			name: string | null;
			email: string | null;
		} | null;
	} | null;
};

async function fetchSharedSharesForUser(userId: string): Promise<
	{
		shareId: string;
		permission: string;
		payer: typeof payers.$inferSelect;
		ownerName: string | null;
		ownerEmail: string | null;
	}[]
> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("compartilhamentos_pagador")
		.select(
			"id, permission, pagadores:pagadores!pagador_id(*, user:user!user_id(name, email))",
		)
		.eq("shared_with_user_id", userId);
	if (error) {
		console.error("[payers] fetchSharedSharesForUser falhou", {
			userId,
			error: error.message,
		});
		throw error;
	}

	return (data ?? []).map((row) => {
		const share = row as unknown as SharedShareRow;
		return {
			shareId: share.id,
			permission: share.permission,
			payer: share.pagadores as unknown as typeof payers.$inferSelect,
			ownerName: share.pagadores?.user?.name ?? null,
			ownerEmail: share.pagadores?.user?.email ?? null,
		};
	});
}

export async function fetchPayersWithAccess(
	userId: string,
): Promise<PayerWithAccess[]> {
	const [owned, shared] = await Promise.all([
		db.query.payers.findMany({
			where: eq(payers.userId, userId),
		}),
		fetchSharedSharesForUser(userId),
	]);

	const ownedMapped: PayerWithAccess[] = owned.map((item) => {
		const access = resolveOwnerAccess();
		return {
			...item,
			canEdit: access.canEdit,
			canManageShares: access.canManageShares,
			sharePermission: access.permission,
			sharedByName: null,
			sharedByEmail: null,
			shareId: null,
		};
	});

	const sharedMapped: PayerWithAccess[] = shared.map((item) => {
		const access = resolveSharedAccess(item.permission);
		return {
			...(item.payer as typeof payers.$inferSelect),
			shareCode: null,
			canEdit: access.canEdit,
			canManageShares: access.canManageShares,
			sharePermission: access.permission,
			sharedByName: item.ownerName ?? null,
			sharedByEmail: item.ownerEmail ?? null,
			shareId: item.shareId,
		};
	});

	return [...ownedMapped, ...sharedMapped];
}

export async function getPayerAccess(userId: string, payerId: string) {
	const pagador = await db.query.payers.findFirst({
		where: and(eq(payers.id, payerId)),
	});

	if (!pagador) {
		return null;
	}

	if (pagador.userId === userId) {
		const access = resolveOwnerAccess();
		return {
			pagador,
			...access,
			share: null as typeof payerShares.$inferSelect | null,
		};
	}

	const share = await db.query.payerShares.findFirst({
		where: and(
			eq(payerShares.payerId, payerId),
			eq(payerShares.sharedWithUserId, userId),
		),
	});

	if (!share) {
		return null;
	}

	const access = resolveSharedAccess(share.permission);

	return {
		pagador,
		...access,
		share,
	};
}

export async function assertPayerShareManagement(
	userId: string,
	payerId: string,
): Promise<
	| { ok: true; pagador: typeof payers.$inferSelect }
	| { ok: false; error: string }
> {
	const access = await getPayerAccess(userId, payerId);

	if (!access) {
		return { ok: false, error: "Pessoa não encontrada." };
	}

	if (!access.canManageShares) {
		return {
			ok: false,
			error: "Você não tem permissão para gerenciar acessos desta pessoa.",
		};
	}

	return { ok: true, pagador: access.pagador };
}

export function getSharePermissionLabel(permission: string | null | undefined) {
	return resolvePayerSharePermission(permission);
}
