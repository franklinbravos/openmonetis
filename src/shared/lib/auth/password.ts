import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";
import { createClient } from "@/shared/lib/supabase/server";

export async function verifyCurrentPassword(
	email: string,
	password: string,
): Promise<boolean> {
	const supabase = await createClient();
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	return !error;
}

export async function updatePassword(
	email: string,
	currentPassword: string,
	newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const valid = await verifyCurrentPassword(email, currentPassword);
	if (!valid) {
		return { ok: false, error: "Senha atual incorreta" };
	}

	const supabase = await createClient();
	const { error } = await supabase.auth.updateUser({ password: newPassword });
	if (error) {
		return { ok: false, error: error.message };
	}
	return { ok: true };
}

export async function setPassword(newPassword: string): Promise<void> {
	const supabase = await createClient();
	const { error } = await supabase.auth.updateUser({ password: newPassword });
	if (error) throw error;
}

export async function updateEmail(newEmail: string): Promise<void> {
	const supabase = await createClient();
	const { error } = await supabase.auth.updateUser({ email: newEmail });
	if (error) throw error;
}

export async function userUsesGoogleAuth(userId: string): Promise<boolean> {
	const admin = getSupabaseAdmin();
	const { data, error } = await admin.auth.admin.getUserById(userId);
	if (error || !data.user) return false;

	const providers = data.user.app_metadata?.providers;
	if (Array.isArray(providers) && providers.includes("google")) {
		return true;
	}

	return (
		data.user.identities?.some((identity) => identity.provider === "google") ??
		false
	);
}

export async function createEmailUser(input: {
	email: string;
	password: string;
	name: string;
	mustChangePassword?: boolean;
}) {
	const admin = getSupabaseAdmin();
	const { data, error } = await admin.auth.admin.createUser({
		email: input.email,
		password: input.password,
		email_confirm: true,
		user_metadata: {
			name: input.name,
			must_change_password: input.mustChangePassword ?? false,
		},
	});
	if (error) throw error;
	return data.user;
}
