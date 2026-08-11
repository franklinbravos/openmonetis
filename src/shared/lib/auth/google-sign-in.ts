"use client";

import { supabase } from "@/shared/lib/auth/client";
import {
	GOOGLE_OAUTH_REDIRECT_URI_COOKIE,
	getGoogleOAuthCallbackUrl,
	getGoogleOAuthConsoleSetup,
} from "@/shared/lib/auth/google-callback-url";

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

function isEmbeddedPreview(): boolean {
	return typeof window !== "undefined" && window.self !== window.top;
}

function logRedirectSetupHint(): void {
	if (process.env.NODE_ENV !== "development") return;

	const { javascriptOrigin, redirectUri } = getGoogleOAuthConsoleSetup();
	console.info(
		"[OpenMonetis] Login Google por redirect — cadastre no Google Cloud Console → Credentials (tipo Web application):\n" +
			`  Origem JavaScript: ${javascriptOrigin}\n` +
			`  URI de redirecionamento: ${redirectUri}`,
	);
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

function persistGoogleRedirectUri(redirectUri: string): void {
	if (typeof document === "undefined") return;
	document.cookie = `${GOOGLE_OAUTH_REDIRECT_URI_COOKIE}=${encodeURIComponent(redirectUri)}; path=/; max-age=600; SameSite=Lax`;
}

function startGoogleRedirect(clientId: string): void {
	const oauth2 = window.google?.accounts?.oauth2;
	if (!oauth2) return;

	const redirectUri = getGoogleOAuthCallbackUrl();
	persistGoogleRedirectUri(redirectUri);
	logRedirectSetupHint();

	const client = oauth2.initCodeClient({
		client_id: clientId,
		scope: "openid email profile",
		ux_mode: "redirect",
		redirect_uri: redirectUri,
		callback: () => {
			// Redirect mode: o callback roda em /auth/google/callback (route handler)
		},
	});

	client.requestCode();
}

/**
 * Redirect completo (sem popup) — usado em iframe/preview ou quando o popup falha.
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
 * Tenta popup (postmessage) quando possível; cai para redirect só em iframe ou se o popup falhar.
 */
export async function signInWithGoogleDirect(): Promise<GoogleSignInResult> {
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

	if (isEmbeddedPreview()) {
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
