import { establishGoogleAuthSession } from "@/shared/lib/auth/google-auth-session";
import {
	getGoogleClientId,
	getGoogleClientSecret,
} from "@/shared/lib/auth/google-env";
import { parseGoogleIdToken } from "@/shared/lib/auth/google-id-token";

export type GoogleOAuthExchangeResult =
	| { ok: true }
	| { ok: false; error: string };

export async function exchangeGoogleAuthCode(
	code: string,
	redirectUri: string,
): Promise<GoogleOAuthExchangeResult> {
	const clientId = getGoogleClientId();
	const clientSecret = getGoogleClientSecret();

	if (!clientId || !clientSecret) {
		return { ok: false, error: "Login com Google não está configurado." };
	}

	const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});

	if (!tokenResponse.ok) {
		const errorBody = await tokenResponse.text();
		console.error("Google token exchange failed:", errorBody);

		try {
			const parsed = JSON.parse(errorBody) as {
				error?: string;
				error_description?: string;
			};
			if (parsed.error === "redirect_uri_mismatch") {
				return { ok: false, error: "redirect_uri_mismatch" };
			}
			if (parsed.error === "invalid_grant") {
				return { ok: false, error: "google_invalid_grant" };
			}
		} catch {
			// keep default message
		}

		return { ok: false, error: "Não foi possível validar o login com Google." };
	}

	const tokens = (await tokenResponse.json()) as { id_token?: string };
	if (!tokens.id_token) {
		return { ok: false, error: "Resposta inválida do Google." };
	}

	try {
		const profile = parseGoogleIdToken(tokens.id_token);
		return establishGoogleAuthSession(profile);
	} catch (error) {
		console.error("Google id_token validation failed:", error);
		return { ok: false, error: "Não foi possível validar o login com Google." };
	}
}
