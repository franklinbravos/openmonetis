import {
	APICallError,
	NoSuchModelError,
	UnsupportedFunctionalityError,
} from "ai";
import { getProviderFromModelId } from "@/shared/lib/ai/model-config-helpers";
import type { ResolvedAiCredentials } from "@/shared/lib/ai/types";

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

/**
 * Reserva precisa estar configurada e trazer algo diferente do que falhou.
 *
 * Mesmo modelo vale quando a reserva tem chave própria: é justamente o caso de
 * ter uma segunda chave do mesmo provedor para quando a cota da primeira acaba.
 */
export function resolveFallbackModelId(input: {
	primaryModelId: string;
	fallbackModelId: string | null | undefined;
	hasOwnKey?: boolean;
}): string | null {
	const fallback = input.fallbackModelId?.trim();
	if (!fallback) return null;
	if (fallback === input.primaryModelId && !input.hasOwnKey) return null;
	return fallback;
}

/**
 * Credenciais para a reserva: a chave própria substitui a do provedor dela,
 * deixando os outros provedores intactos.
 */
export function buildFallbackCredentials(input: {
	credentials: ResolvedAiCredentials;
	modelId: string;
	apiKey: string | null;
	baseUrl: string | null;
}): ResolvedAiCredentials {
	if (!input.apiKey) return input.credentials;

	const provider = getProviderFromModelId(input.modelId);
	if (!provider) return input.credentials;

	const current = input.credentials[provider];

	return {
		...input.credentials,
		[provider]: {
			...current,
			apiKey: input.apiKey,
			baseUrl: input.baseUrl ?? current?.baseUrl,
			source: "database" as const,
		},
	};
}
