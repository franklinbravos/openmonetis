import {
	APICallError,
	NoSuchModelError,
	UnsupportedFunctionalityError,
} from "ai";

/**
 * Quando vale repetir o lote no modelo de reserva.
 *
 * Só falhas do lado do provedor entram: cota estourada, indisponibilidade e
 * modelo inexistente ou sem suporte ao formato pedido. Chave rejeitada (401/403)
 * fica de fora de propósito — é erro de configuração que precisa aparecer, e
 * mascarar isso com o modelo de reserva deixaria a chave quebrada passar batido.
 */
export function shouldRetryWithFallbackModel(error: unknown): boolean {
	if (NoSuchModelError.isInstance(error)) return true;
	if (UnsupportedFunctionalityError.isInstance(error)) return true;

	if (APICallError.isInstance(error)) {
		const status = error.statusCode ?? 0;
		if (status === 429) return true;
		if (status === 404) return true;
		if (status >= 500) return true;
	}

	return false;
}

/** Reserva só serve se estiver configurada e for diferente do modelo que falhou. */
export function resolveFallbackModelId(input: {
	primaryModelId: string;
	fallbackModelId: string | null | undefined;
}): string | null {
	const fallback = input.fallbackModelId?.trim();
	if (!fallback) return null;
	if (fallback === input.primaryModelId) return null;
	return fallback;
}
