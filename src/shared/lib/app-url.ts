/**
 * URL base do app para links e OAuth.
 * Preferir APP_URL / NEXT_PUBLIC_APP_URL para evitar mismatch com Google OAuth
 * quando o browser abre em 127.0.0.1, IP da rede ou preview embutido.
 */
export function getAppOrigin(): string {
	const configured =
		process.env.NEXT_PUBLIC_APP_URL?.trim() ||
		process.env.APP_URL?.trim() ||
		"";

	if (configured) {
		return configured.replace(/\/$/, "");
	}

	if (typeof window !== "undefined") {
		return window.location.origin;
	}

	return "";
}

export function getAppUrl(path = ""): string {
	const origin = getAppOrigin();
	if (!origin) return path || "/";
	if (!path) return origin;
	return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
