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

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "0.0.0.0"
	);
}

/**
 * Em dev, alinha 127.0.0.1 ↔ localhost para bater com o Google Cloud Console.
 */
export function normalizeOAuthOrigin(origin: string): string {
	const configured = getAppOrigin();
	if (!configured || !origin) return origin;

	try {
		const current = new URL(origin);
		const canonical = new URL(configured);

		if (
			process.env.NODE_ENV === "development" &&
			isLoopbackHostname(current.hostname) &&
			isLoopbackHostname(canonical.hostname) &&
			current.port === canonical.port
		) {
			return canonical.origin;
		}
	} catch {
		return origin;
	}

	return origin;
}

export function getAppUrl(path = ""): string {
	const origin = getAppOrigin();
	if (!origin) return path || "/";
	if (!path) return origin;
	return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
