import type { GoogleProfile } from "@/shared/lib/auth/google-id-token";
import { isSignupDisabled } from "@/shared/lib/auth/signup";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";
import { createClient } from "@/shared/lib/supabase/server";

function isAlreadyRegisteredError(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("already") ||
		normalized.includes("registered") ||
		normalized.includes("exists")
	);
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
	const admin = getSupabaseAdmin();

	const { data: appUser } = await admin
		.from("user")
		.select("id")
		.eq("email", email)
		.maybeSingle();

	if (appUser && typeof appUser.id === "string") {
		return appUser.id;
	}

	let page = 1;
	const perPage = 200;

	while (page <= 10) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
		if (error) throw error;

		const match = data.users.find(
			(user) => user.email?.toLowerCase() === email,
		);
		if (match?.id) return match.id;

		if (data.users.length < perPage) break;
		page += 1;
	}

	return null;
}

async function ensureAuthUser(profile: GoogleProfile): Promise<string> {
	const admin = getSupabaseAdmin();
	const email = profile.email;

	const existingId = await findAuthUserIdByEmail(email);
	if (existingId) {
		await admin.auth.admin.updateUserById(existingId, {
			user_metadata: {
				name: profile.name,
				avatar_url: profile.picture,
				picture: profile.picture,
			},
			app_metadata: {
				provider: "google",
				providers: ["google"],
			},
		});
		return existingId;
	}

	if (isSignupDisabled()) {
		throw new Error("signup_disabled");
	}

	const { data: created, error: createError } =
		await admin.auth.admin.createUser({
			email,
			email_confirm: true,
			user_metadata: {
				name: profile.name,
				avatar_url: profile.picture,
				picture: profile.picture,
			},
			app_metadata: {
				provider: "google",
				providers: ["google"],
			},
		});

	if (createError) {
		if (!isAlreadyRegisteredError(createError.message)) {
			throw createError;
		}

		const fallbackId = await findAuthUserIdByEmail(email);
		if (!fallbackId) throw createError;
		return fallbackId;
	}

	if (!created.user?.id) {
		throw new Error("Não foi possível criar usuário.");
	}

	return created.user.id;
}

/**
 * Cria sessão Supabase via Admin API + verifyOtp, sem configurar provider Google no painel.
 * Toda a validação OAuth acontece no Next.js; o banco só recebe usuário/sessão via service role.
 */
export async function establishGoogleAuthSession(
	profile: GoogleProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		await ensureAuthUser(profile);

		const admin = getSupabaseAdmin();
		const { data: linkData, error: linkError } =
			await admin.auth.admin.generateLink({
				type: "magiclink",
				email: profile.email,
			});

		if (linkError || !linkData?.properties?.hashed_token) {
			console.error("Google auth generateLink failed:", linkError);
			return {
				ok: false,
				error: "Não foi possível concluir o login com Google.",
			};
		}

		const supabase = await createClient();
		const tokenHash = linkData.properties.hashed_token;

		const { error: verifyError } = await supabase.auth.verifyOtp({
			type: "magiclink",
			token_hash: tokenHash,
		});

		if (verifyError) {
			const { error: retryError } = await supabase.auth.verifyOtp({
				type: "email",
				token_hash: tokenHash,
			});

			if (retryError) {
				console.error("Google auth verifyOtp failed:", verifyError, retryError);
				return {
					ok: false,
					error: "Não foi possível concluir o login com Google.",
				};
			}
		}

		return { ok: true };
	} catch (error) {
		if (error instanceof Error && error.message === "signup_disabled") {
			return { ok: false, error: "signup_disabled" };
		}

		console.error("Google auth session failed:", error);
		return {
			ok: false,
			error: "Não foi possível concluir o login com Google.",
		};
	}
}
