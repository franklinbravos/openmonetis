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
			return "Limite de uso da API atingido. Aguarde alguns minutos e tente novamente.";
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

export function formatAiActionError(
	error: unknown,
	context: "import" | "insights" = "import",
	options?: { modelLabel?: string | null },
): string {
	const message = formatAiActionErrorCore(unwrapAiError(error), context);
	const modelLabel = options?.modelLabel?.trim();

	if (!modelLabel) {
		return message;
	}

	return `${message} (Modelo: ${modelLabel})`;
}
