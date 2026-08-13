import {
	bootstrapFamilyAccessForUser,
	findFamilyAdminPayer,
} from "@/features/payers/lib/payer-family-access";
import type { AppUser } from "@/shared/lib/auth/server";
import { seedDefaultCategoriesForUser } from "@/shared/lib/categories/defaults";
import { ensureDefaultPayerForUser } from "@/shared/lib/payers/defaults";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";

const bootstrapped = new Set<string>();

/**
 * Garante registro em public.user + seeds após signup (Supabase Auth).
 * Primeiro usuário da instância: categorias + pagador admin.
 * Demais usuários: acesso familiar automático, sem seed financeiro duplicado.
 */
export async function ensureUserBootstrap(user: AppUser) {
	if (bootstrapped.has(user.id)) return;

	const admin = getSupabaseAdmin();
	const now = new Date().toISOString();

	await admin.from("user").upsert(
		{
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			must_change_password: user.mustChangePassword,
			image: user.image,
			createdAt: now,
			updatedAt: now,
		} as never,
		{ onConflict: "id" },
	);

	const familyAdmin = await findFamilyAdminPayer();
	const isFirstFamilyUser = !familyAdmin;

	if (isFirstFamilyUser) {
		await seedDefaultCategoriesForUser(user.id);
		await ensureDefaultPayerForUser({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
		});
	} else {
		await bootstrapFamilyAccessForUser({
			id: user.id,
			email: user.email,
		});
	}

	bootstrapped.add(user.id);
}
