"use client";

import { supabase } from "@/shared/lib/auth/client";
import { getGoogleOAuthCallbackUrl } from "@/shared/lib/auth/google-callback-url";

const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type GoogleCodeClient = {
	requestCode: () => void;
};

type GoogleOAuth2 = {
	initCodeClient: (config: {
		client_id: string;
		scope: string;
		ux_mode?: "popup" | "redirect";
		redirect_uri?: string;
		callback: (response: { code: string } | { error: string }) => void;
		error_callback?: (error: unknown) => void;
	}) => GoogleCodeClient;
};

export type GoogleSignInResult = {
	error?: string;
	/** OAuth por redirect em andamento — não tratar como login concluído. */
	redirecting?: boolean;
};

declare global {
	interface Window {
		google?: {
			accounts: {
				oauth2: GoogleOAuth2;
			};
		};
	}
}

let scriptPromise: Promise<void> | null = null;

function getPublicGoogleClientId(): string | undefined {
	const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
	return id || undefined;
}

function loadGoogleScript(): Promise<void> {
	if (typeof window === "undefined") {
		return Promise.reject(
			new Error("Google Sign-In indisponível no servidor."),
		);
	}

	if (window.google?.accounts?.oauth2) {
		return Promise.resolve();
	}

	if (!scriptPromise) {
		scriptPromise = new Promise((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>(
				`script[src="${GSI_SCRIPT_URL}"]`,
			);
			if (existing) {
				existing.addEventListener("load", () => resolve(), { once: true });
				existing.addEventListener(
					"error",
					() => reject(new Error("Falha ao carregar Google Sign-In.")),
					{ once: true },
				);
				return;
			}

			const script = document.createElement("script");
			script.src = GSI_SCRIPT_URL;
			script.async = true;
			script.defer = true;
			script.onload = () => resolve();
			script.onerror = () =>
				reject(new Error("Falha ao carregar Google Sign-In."));
			document.head.appendChild(script);
		});
	}

	return scriptPromise;
}

function isGoogleOAuthReady(): boolean {
	return Boolean(window.google?.accounts?.oauth2);
}

function isPopupLikelyBlocked(): boolean {
	try {
		const popup = window.open("about:blank", "_blank", "width=1,height=1");
		if (!popup) return true;
		popup.close();
		return false;
	} catch {
		return true;
	}
}

/** Preview embutido (Cursor/iframe) — popup costuma falhar; usar redirect. */
function shouldPreferRedirect(): boolean {
	if (typeof window === "undefined") return true;
	if (window.self !== window.top) return true;
	return isPopupLikelyBlocked();
}

/** Pré-carrega o script GIS para preservar o gesto de clique no popup. */
export function preloadGoogleSignIn(): void {
	if (typeof window === "undefined" || !getPublicGoogleClientId()) return;
	void loadGoogleScript().catch(() => {});
}

async function exchangeGoogleCode(
	code: string,
	redirectUri = "postmessage",
): Promise<{ error?: string }> {
	try {
		const res = await fetch("/api/auth/google", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, redirect_uri: redirectUri }),
			credentials: "same-origin",
		});
		const data = (await res.json()) as { error?: string };

		if (!res.ok) {
			return {
				error: data.error ?? "Não foi possível entrar com Google.",
			};
		}

		await supabase.auth.getSession();
		return {};
	} catch {
		return {
			error: "Falha na requisição. Tente novamente mais tarde.",
		};
	}
}

function startGoogleRedirect(clientId: string): void {
	const oauth2 = window.google?.accounts?.oauth2;
	if (!oauth2) return;

	const client = oauth2.initCodeClient({
		client_id: clientId,
		scope: "openid email profile",
		ux_mode: "redirect",
		redirect_uri: getGoogleOAuthCallbackUrl(),
		callback: () => {
			// Redirect mode: o callback roda em /auth/google/callback
		},
	});

	client.requestCode();
}

/**
 * Redirect completo (sem popup) — funciona em browsers que bloqueiam popups
 * (ex.: preview embutido do Cursor).
 */
export async function signInWithGoogleRedirect(): Promise<GoogleSignInResult> {
	const clientId = getPublicGoogleClientId();
	if (!clientId) {
		return { error: "Login com Google não está configurado." };
	}

	try {
		await loadGoogleScript();
	} catch {
		return { error: "Falha ao carregar Google Sign-In." };
	}

	if (!isGoogleOAuthReady()) {
		return { error: "Google Sign-In indisponível no momento." };
	}

	startGoogleRedirect(clientId);
	return { redirecting: true };
}

/**
 * Login Google direto (accounts.google.com → app) sem redirect pelo domínio Supabase.
 * Usa popup quando possível; cai para redirect se o script não estiver pronto,
 * se o browser bloquear popups ou se estiver em iframe/preview.
 */
export function signInWithGoogleDirect(): Promise<GoogleSignInResult> {
	const clientId = getPublicGoogleClientId();
	if (!clientId) {
		return Promise.resolve({ error: "Login com Google não está configurado." });
	}

	if (!isGoogleOAuthReady() || shouldPreferRedirect()) {
		return signInWithGoogleRedirect();
	}

	return new Promise((resolve) => {
		const oauth2 = window.google?.accounts?.oauth2;
		if (!oauth2) {
			void signInWithGoogleRedirect().then(resolve);
			return;
		}

		const client = oauth2.initCodeClient({
			client_id: clientId,
			scope: "openid email profile",
			ux_mode: "popup",
			callback: async (response) => {
				if ("error" in response) {
					resolve({ error: "Login com Google cancelado." });
					return;
				}

				resolve(await exchangeGoogleCode(response.code));
			},
			error_callback: () => {
				void signInWithGoogleRedirect().then(resolve);
			},
		});

		client.requestCode();
	});
}

export function isGoogleSignInAvailable(): boolean {
	return Boolean(getPublicGoogleClientId());
}
