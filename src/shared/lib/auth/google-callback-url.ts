import { getAppOrigin, normalizeOAuthOrigin } from "@/shared/lib/app-url";

export const GOOGLE_OAUTH_REDIRECT_URI_COOKIE =
	"openmonetis_google_redirect_uri";

export function getGoogleOAuthCallbackPath(): string {
	return "/auth/google/callback";
}

/**
 * Origem usada no OAuth Google no browser.
 * Preferimos a URL canônica (APP_URL) em loopback dev para bater com o Google Console.
 */
export function getGoogleOAuthCallbackOrigin(): string {
	if (typeof window !== "undefined" && window.location?.origin) {
		return normalizeOAuthOrigin(window.location.origin);
	}

	return getAppOrigin();
}

export function getGoogleOAuthCallbackUrl(origin?: string): string {
	const base = origin ?? getGoogleOAuthCallbackOrigin();
	if (!base) {
		throw new Error(
			"APP_URL não configurada. Defina APP_URL=http://localhost:3050 no .env.",
		);
	}
	return `${base.replace(/\/$/, "")}${getGoogleOAuthCallbackPath()}`;
}

/** URLs que o admin deve cadastrar no Google Cloud Console (tipo Web). */
export function getGoogleOAuthConsoleSetup(): {
	javascriptOrigin: string;
	redirectUri: string;
} {
	const origin = getGoogleOAuthCallbackOrigin() || getAppOrigin();
	const normalized = origin.replace(/\/$/, "");
	return {
		javascriptOrigin: normalized,
		redirectUri: `${normalized}${getGoogleOAuthCallbackPath()}`,
	};
}
