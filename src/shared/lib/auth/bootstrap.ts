import type { AppUser } from "@/shared/lib/auth/server";
import { seedDefaultCategoriesForUser } from "@/shared/lib/categories/defaults";
import { ensureDefaultPayerForUser } from "@/shared/lib/payers/defaults";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";

const bootstrapped = new Set<string>();

/**
 * Garante registro em public.user + seeds após signup (Supabase Auth).
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

	await seedDefaultCategoriesForUser(user.id);
	await ensureDefaultPayerForUser({
		id: user.id,
		name: user.name,
		email: user.email,
		image: user.image,
	});

	bootstrapped.add(user.id);
}
