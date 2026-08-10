import { getGoogleClientId } from "@/shared/lib/auth/google-env";

export type GoogleProfile = {
	email: string;
	name: string;
	picture?: string;
	sub: string;
};

type GoogleIdTokenPayload = {
	iss?: string;
	aud?: string | string[];
	exp?: number;
	email?: string;
	email_verified?: boolean | string;
	name?: string;
	picture?: string;
	sub?: string;
};

function decodeJwtPayload(idToken: string): GoogleIdTokenPayload {
	const parts = idToken.split(".");
	if (parts.length !== 3) {
		throw new Error("Token Google inválido.");
	}

	const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
	const json = Buffer.from(padded, "base64").toString("utf8");
	return JSON.parse(json) as GoogleIdTokenPayload;
}

/**
 * Valida claims do id_token retornado pelo endpoint /token do Google.
 * A troca do code já autentica o app via client_secret; aqui validamos audience/expiração.
 */
export function parseGoogleIdToken(idToken: string): GoogleProfile {
	const clientId = getGoogleClientId();
	if (!clientId) {
		throw new Error("Login com Google não está configurado.");
	}

	const payload = decodeJwtPayload(idToken);
	const audience = payload.aud;
	const audienceMatches = Array.isArray(audience)
		? audience.includes(clientId)
		: audience === clientId;

	if (!audienceMatches) {
		throw new Error("Token Google com audience inválida.");
	}

	const issuer = payload.iss;
	if (
		issuer !== "accounts.google.com" &&
		issuer !== "https://accounts.google.com"
	) {
		throw new Error("Token Google com emissor inválido.");
	}

	const now = Math.floor(Date.now() / 1000);
	if (!payload.exp || payload.exp <= now) {
		throw new Error("Token Google expirado.");
	}

	if (!payload.email) {
		throw new Error("O Google não retornou e-mail da conta.");
	}

	const emailVerified =
		payload.email_verified === true || payload.email_verified === "true";
	if (!emailVerified) {
		throw new Error("E-mail Google não verificado.");
	}

	if (!payload.sub) {
		throw new Error("Token Google sem identificador do usuário.");
	}

	return {
		email: payload.email.toLowerCase(),
		name: payload.name?.trim() || payload.email.split("@")[0] || "Usuário",
		picture: payload.picture,
		sub: payload.sub,
	};
}
