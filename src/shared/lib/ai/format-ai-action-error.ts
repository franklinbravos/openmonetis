import {
	APICallError,
	InvalidResponseDataError,
	JSONParseError,
	NoObjectGeneratedError,
	NoSuchModelError,
	RetryError,
	TypeValidationError,
	UnsupportedFunctionalityError,
} from "ai";
import { z } from "zod";

const GENERIC_AI_ERROR =
	"Não foi possível concluir a operação com IA. Tente novamente.";

function unwrapAiError(error: unknown): unknown {
	if (RetryError.isInstance(error) && error.lastError != null) {
		return unwrapAiError(error.lastError);
	}

	return error;
}

function formatAiActionErrorCore(
	error: unknown,
	context: "import" | "insights",
): string {
	if (error instanceof z.ZodError) {
		return context === "import"
			? "A IA retornou um formato inesperado. Tente outro modelo em Ajustes → Inteligência artificial."
			: "A IA retornou um formato inesperado. Tente outro modelo em Ajustes.";
	}

	if (NoObjectGeneratedError.isInstance(error)) {
		return "O modelo não conseguiu gerar a resposta estruturada. Escolha outro modelo em Ajustes → Inteligência artificial.";
	}

	if (
		TypeValidationError.isInstance(error) ||
		JSONParseError.isInstance(error) ||
		InvalidResponseDataError.isInstance(error)
	) {
		return "A IA retornou um formato inesperado. Tente outro modelo em Ajustes → Inteligência artificial.";
	}

	if (UnsupportedFunctionalityError.isInstance(error)) {
		return "O modelo selecionado não suporta saída estruturada para esta análise. Escolha outro modelo em Ajustes → Inteligência artificial.";
	}

	if (NoSuchModelError.isInstance(error)) {
		return "Modelo não encontrado no provedor configurado. Selecione outro modelo em Ajustes → Inteligência artificial.";
	}

	if (APICallError.isInstance(error)) {
		if (error.statusCode === 401 || error.statusCode === 403) {
			return "A chave foi rejeitada pela API do provedor. Salve-a novamente em Ajustes → Inteligência artificial.";
		}

		if (error.statusCode === 429) {
			return isProviderQuotaExhausted(error)
				? "A cota do provedor para este modelo acabou — esperar alguns minutos não resolve. Escolha outro modelo, ou configure um modelo de reserva, em Ajustes → Inteligência artificial."
				: "Limite de uso da API atingido. Aguarde alguns minutos e tente novamente.";
		}

		if (error.statusCode === 404) {
			return "Modelo não encontrado no provedor configurado. Selecione outro modelo em Ajustes → Inteligência artificial.";
		}

		return "Falha ao contactar o provedor de IA. Verifique a chave e o modelo em Ajustes → Inteligência artificial.";
	}

	if (error instanceof Error) {
		const message = error.message.trim();
		if (
			message.includes("não configurado") ||
			message.includes("Modelo inválido") ||
			message.includes("Informe um modelo válido")
		) {
			return message;
		}
	}

	return context === "import"
		? "Não foi possível concluir a análise com IA."
		: GENERIC_AI_ERROR;
}

/**
 * Um 429 pode ser dois bichos diferentes: excesso de chamadas por minuto, que
 * passa sozinho, ou cota do plano esgotada, que só volta na virada do período.
 * Mandar o usuário "aguardar alguns minutos" no segundo caso é enganá-lo.
 */
const QUOTA_EXHAUSTED_PATTERNS = [
	/weekly|monthly|daily/i,
	/usage limit/i,
	/quota/i,
	/resets? in/i,
	/limite (semanal|mensal|di[áa]rio)/i,
	/insufficient_quota/i,
];

export function isProviderQuotaExhausted(error: {
	message?: string;
	responseBody?: string | null;
}): boolean {
	const haystack = `${error.message ?? ""} ${error.responseBody ?? ""}`;
	return QUOTA_EXHAUSTED_PATTERNS.some((pattern) => pattern.test(haystack));
}

const SECRET_PATTERNS = [
	/Bearer\s+[A-Za-z0-9._-]+/gi,
	/sk-[A-Za-z0-9._-]+/g,
	/x-api-key:\s*\S+/gi,
	/"api[_-]?key"\s*:\s*"[^"]+"/gi,
];

function redactSecrets(value: string): string {
	return SECRET_PATTERNS.reduce(
		(text, pattern) => text.replace(pattern, "[REDACTADO]"),
		value,
	);
}

function truncate(value: string, max = 2000): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}… [truncado]`;
}

function serializeErrorChain(error: unknown, depth = 0): string[] {
	const indent = "  ".repeat(depth);

	if (RetryError.isInstance(error)) {
		const lines = [
			`${indent}[RetryError] ${error.message} (motivo: ${error.reason})`,
		];
		for (const nestedError of error.errors) {
			lines.push(...serializeErrorChain(nestedError, depth + 1));
		}
		return lines;
	}

	if (APICallError.isInstance(error)) {
		const lines = [
			`${indent}[APICallError] HTTP ${error.statusCode ?? "?"} — ${error.message}`,
		];

		if (error.url) {
			lines.push(`${indent}url: ${error.url}`);
		}

		if (error.responseBody != null) {
			const body =
				typeof error.responseBody === "string"
					? error.responseBody
					: JSON.stringify(error.responseBody, null, 2);
			lines.push(`${indent}response: ${truncate(body)}`);
		}

		if (error.isRetryable != null) {
			lines.push(`${indent}retryable: ${String(error.isRetryable)}`);
		}

		return lines;
	}

	if (NoObjectGeneratedError.isInstance(error)) {
		const lines = [`${indent}[NoObjectGeneratedError] ${error.message}`];

		if (error.finishReason) {
			lines.push(`${indent}finishReason: ${error.finishReason}`);
		}

		if (error.text) {
			lines.push(`${indent}text: ${truncate(error.text, 1500)}`);
		}

		if (error.cause) {
			lines.push(...serializeErrorChain(error.cause, depth + 1));
		}

		return lines;
	}

	if (TypeValidationError.isInstance(error)) {
		return [
			`${indent}[TypeValidationError] ${error.message}`,
			`${indent}value: ${truncate(JSON.stringify(error.value ?? null, null, 2), 1500)}`,
		];
	}

	if (JSONParseError.isInstance(error)) {
		return [
			`${indent}[JSONParseError] ${error.message}`,
			...(error.text ? [`${indent}text: ${truncate(error.text, 1500)}`] : []),
		];
	}

	if (InvalidResponseDataError.isInstance(error)) {
		return [`${indent}[InvalidResponseDataError] ${error.message}`];
	}

	if (UnsupportedFunctionalityError.isInstance(error)) {
		return [
			`${indent}[UnsupportedFunctionalityError] ${error.message}`,
			...(error.functionality
				? [`${indent}functionality: ${error.functionality}`]
				: []),
		];
	}

	if (NoSuchModelError.isInstance(error)) {
		return [
			`${indent}[NoSuchModelError] ${error.message}`,
			...(error.modelId ? [`${indent}modelId: ${error.modelId}`] : []),
		];
	}

	if (error instanceof z.ZodError) {
		return [
			`${indent}[ZodError] validação falhou`,
			...error.issues.map(
				(issue) =>
					`${indent}- ${issue.path.join(".") || "(raiz)"}: ${issue.message}`,
			),
		];
	}

	if (error instanceof Error) {
		const lines = [`${indent}[${error.name}] ${error.message}`];
		if (error.cause) {
			lines.push(...serializeErrorChain(error.cause, depth + 1));
		}
		return lines;
	}

	return [`${indent}${String(error)}`];
}

export function serializeAiActionErrorLog(
	error: unknown,
	context?: Record<string, string | number | boolean | null | undefined>,
): string {
	const sections: string[] = [`timestamp: ${new Date().toISOString()}`];

	if (context) {
		sections.push("", "Contexto:");
		for (const [key, value] of Object.entries(context)) {
			if (value == null) continue;
			sections.push(`  ${key}: ${value}`);
		}
	}

	sections.push("", "Detalhes:");
	sections.push(...serializeErrorChain(error));

	return redactSecrets(sections.join("\n"));
}

export function formatAiActionError(
	error: unknown,
	context: "import" | "insights" = "import",
	options?: { modelLabel?: string | null },
): string {
	const unwrapped = unwrapAiError(error);
	const message = formatAiActionErrorCore(unwrapped, context);
	const modelLabel = options?.modelLabel?.trim();

	if (message === "Não foi possível concluir a análise com IA.") {
		console.error("[formatAiActionError] erro não categorizado", {
			context,
			errorName: unwrapped?.constructor?.name,
			errorMessage:
				unwrapped instanceof Error ? unwrapped.message : String(unwrapped),
			causeName: (unwrapped as { cause?: unknown })?.cause?.constructor?.name,
			causeMessage:
				unwrapped instanceof Error && unwrapped.cause instanceof Error
					? unwrapped.cause.message
					: undefined,
		});
	}

	if (!modelLabel) {
		return message;
	}

	return `${message} (Modelo: ${modelLabel})`;
}
