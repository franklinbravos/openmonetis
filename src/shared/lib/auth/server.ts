import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ensureUserBootstrap } from "@/shared/lib/auth/bootstrap";
import { createClient } from "@/shared/lib/supabase/server";

export type AppUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	mustChangePassword: boolean;
	emailVerified: boolean;
};

const getSessionCached = cache(async () => {
	const supabase = await createClient();
	const { data, error } = await supabase.auth.getUser();
	if (error || !data.user) {
		return null;
	}

	const user = data.user;
	const metadata = user.user_metadata ?? {};

	return {
		user: {
			id: user.id,
			name:
				(typeof metadata.name === "string" && metadata.name) ||
				user.email?.split("@")[0] ||
				"Usuário",
			email: user.email ?? "",
			image:
				(typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
				(typeof metadata.picture === "string" && metadata.picture) ||
				null,
			mustChangePassword: Boolean(metadata.must_change_password),
			emailVerified: Boolean(user.email_confirmed_at),
		} satisfies AppUser,
	};
});

/**
 * Gets the current authenticated user
 */
export async function getUser(): Promise<AppUser> {
	const session = await getSessionCached();

	if (!session?.user) {
		redirect("/login");
	}

	await ensureUserBootstrap(session.user);
	return session.user;
}

export async function getUserId(): Promise<string> {
	const user = await getUser();
	return user.id;
}

export async function getUserSession() {
	const session = await getSessionCached();
	if (!session?.user) {
		redirect("/login");
	}
	await ensureUserBootstrap(session.user);
	return session;
}

export async function getOptionalUserSession() {
	return getSessionCached();
}

export async function getOptionalUser(): Promise<AppUser | null> {
	const session = await getSessionCached();
	return session?.user ?? null;
}

export async function getAuthHeadersUserId(): Promise<string | null> {
	const session = await getSessionCached();
	return session?.user.id ?? null;
}
