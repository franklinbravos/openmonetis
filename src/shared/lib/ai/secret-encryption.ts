import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";

const ENCRYPTION_SALT = "openmonetis-ai-secrets-v1";

function getEncryptionKey(): Buffer {
	const secret = process.env.APP_SECRET;
	if (!secret) {
		throw new Error("APP_SECRET não configurado.");
	}

	return scryptSync(secret, ENCRYPTION_SALT, 32);
}

export function encryptSecret(plainText: string): string {
	const key = getEncryptionKey();
	const initializationVector = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
	const encrypted = Buffer.concat([
		cipher.update(plainText, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return [
		initializationVector.toString("base64"),
		authTag.toString("base64"),
		encrypted.toString("base64"),
	].join(":");
}

export function decryptSecret(payload: string): string {
	const decrypted = tryDecryptSecret(payload);
	if (decrypted == null) {
		throw new Error("Não foi possível descriptografar o segredo.");
	}

	return decrypted;
}

/** Retorna null quando o payload é inválido ou a chave (APP_SECRET) mudou. */
export function tryDecryptSecret(payload: string): string | null {
	try {
		const [initializationVectorBase64, authTagBase64, encryptedBase64] =
			payload.split(":");

		if (!initializationVectorBase64 || !authTagBase64 || !encryptedBase64) {
			return null;
		}

		const key = getEncryptionKey();
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key,
			Buffer.from(initializationVectorBase64, "base64"),
		);
		decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

		return Buffer.concat([
			decipher.update(Buffer.from(encryptedBase64, "base64")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		return null;
	}
}

export type SecretReadFailureReason =
	| "missing_app_secret"
	| "malformed_payload"
	| "app_secret_changed";

/**
 * Diagnostica por que um payload criptografado não abre com o APP_SECRET atual.
 * Usado para logar no servidor a causa exata (útil em produção), sem vazar
 * conteúdo sensível.
 */
export function diagnoseSecretReadFailure(
	payload: string,
): SecretReadFailureReason {
	if (!process.env.APP_SECRET) {
		return "missing_app_secret";
	}

	const parts = payload.split(":");
	if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
		return "malformed_payload";
	}

	return "app_secret_changed";
}

/** Registra falha de leitura só quando indica dado corrompido ou env ausente. */
export function logSecretReadFailure(
	context: string,
	payload: string,
): SecretReadFailureReason {
	const reason = diagnoseSecretReadFailure(payload);
	if (reason === "app_secret_changed") {
		return reason;
	}

	console.error(`${context}: segredo ilegível`, reason);
	return reason;
}

export function maskApiKey(apiKey: string): string {
	const trimmedKey = apiKey.trim();
	if (trimmedKey.length <= 4) {
		return "***";
	}

	const visiblePrefixLength = Math.min(8, trimmedKey.length - 3);
	return `${trimmedKey.slice(0, visiblePrefixLength)}***`;
}
