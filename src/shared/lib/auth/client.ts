"use client";

import {
	isGoogleSignInAvailable,
	signInWithGoogleDirect,
} from "@/shared/lib/auth/google-sign-in";
import { createClient } from "@/shared/lib/supabase/client";

let browserClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
	if (!browserClient) {
		browserClient = createClient();
	}
	return browserClient;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
	get(_target, prop) {
		return Reflect.get(getSupabase(), prop);
	},
});

export const googleSignInAvailable = isGoogleSignInAvailable();

export async function signInWithEmail(email: string, password: string) {
	try {
		const res = await fetch("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
			credentials: "same-origin",
		});
		const data = (await res.json()) as { error?: string };

		if (!res.ok) {
			return {
				data: { user: null, session: null },
				error: {
					message: data.error ?? "Não foi possível entrar.",
					status: res.status,
					name: "AuthApiError",
				},
			};
		}

		await supabase.auth.getSession();

		return { data: { user: null, session: null }, error: null };
	} catch {
		return {
			data: { user: null, session: null },
			error: {
				message: "Falha na requisição. Tente novamente mais tarde.",
				status: 500,
				name: "AuthApiError",
			},
		};
	}
}

export async function signUpWithEmail(
	email: string,
	password: string,
	fullName: string,
) {
	return supabase.auth.signUp({
		email,
		password,
		options: {
			data: { name: fullName },
		},
	});
}

export async function signInWithGoogle() {
	return signInWithGoogleDirect();
}

export async function signOut() {
	await fetch("/api/auth/logout", {
		method: "POST",
		credentials: "same-origin",
	});
	return supabase.auth.signOut();
}

/** @deprecated use supabase diretamente — mantido para migração gradual */
export const authClient = {
	signIn: {
		email: async (
			input: { email: string; password: string },
			callbacks?: {
				onRequest?: () => void;
				onSuccess?: () => void;
				onError?: (ctx: {
					error: { message: string; status?: number; statusText?: string };
				}) => void;
			},
		) => {
			callbacks?.onRequest?.();
			const { error } = await signInWithEmail(input.email, input.password);
			if (error) {
				callbacks?.onError?.({
					error: {
						message: error.message,
						status: error.status,
						statusText: error.name,
					},
				});
				return;
			}
			callbacks?.onSuccess?.();
		},
		social: async (
			input: { provider: string; callbackURL?: string },
			callbacks?: {
				onSuccess?: () => void;
				onError?: (ctx: { error: { message: string } }) => void;
			},
		) => {
			if (input.provider !== "google") {
				callbacks?.onError?.({ error: { message: "Provedor não suportado." } });
				return;
			}
			const result = await signInWithGoogle();
			if (result.error) {
				callbacks?.onError?.({ error: { message: result.error } });
				return;
			}
			if (result.redirecting) {
				return;
			}
			callbacks?.onSuccess?.();
		},
		passkey: async () => ({
			error: { message: "Passkeys não estão disponíveis nesta versão." },
		}),
	},
	signUp: {
		email: async (
			input: { email: string; password: string; name: string },
			callbacks?: {
				onRequest?: () => void;
				onSuccess?: () => void;
				onError?: (ctx: { error: { message: string } }) => void;
			},
		) => {
			callbacks?.onRequest?.();
			const { error } = await signUpWithEmail(
				input.email,
				input.password,
				input.name,
			);
			if (error) {
				callbacks?.onError?.({ error: { message: error.message } });
				return;
			}
			callbacks?.onSuccess?.();
		},
	},
	signOut,
};
