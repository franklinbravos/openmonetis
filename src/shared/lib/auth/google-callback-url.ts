import { getAppOrigin } from "@/shared/lib/app-url";

export function getGoogleOAuthCallbackPath(): string {
	return "/auth/google/callback";
}

export function getGoogleOAuthCallbackUrl(origin?: string): string {
	const base = origin ?? getAppOrigin();
	if (!base) {
		throw new Error(
			"APP_URL não configurada. Defina APP_URL=http://localhost:3050 no .env.",
		);
	}
	return `${base}${getGoogleOAuthCallbackPath()}`;
}
