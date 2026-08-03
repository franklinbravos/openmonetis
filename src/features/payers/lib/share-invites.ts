import { createHash, randomBytes } from "node:crypto";

const INVITE_TOKEN_BYTES = 24;
const INVITE_EXPIRY_DAYS = 7;

export function generateInviteToken(): string {
	return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function getInviteExpiryDate(): Date {
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
	return expiresAt;
}

export function buildInviteUrl(token: string): string {
	const baseURL =
		process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ??
		`http://localhost:${process.env.APP_PORT ?? "3050"}`;
	return `${baseURL}/invite?token=${encodeURIComponent(token)}`;
}

export function generateTemporaryPassword(): string {
	const alphabet =
		"abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
	const bytes = randomBytes(16);
	let password = "";

	for (let index = 0; index < 16; index += 1) {
		password += alphabet[bytes[index] % alphabet.length];
	}

	return password;
}
