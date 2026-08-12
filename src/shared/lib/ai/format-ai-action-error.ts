import { APICallError, NoObjectGeneratedError } from "ai";
import { z } from "zod";

const GENERIC_AI_ERROR =
	"Não foi possível concluir a operação com IA. Tente novamente.";

export function formatAiActionError(
	error: unknown,
	context: "import" | "insights" = "import",
): string {
	if (error instanceof z.ZodError) {
		return context === "import"
			? "A IA retornou um formato inesperado. Tente outro modelo em Ajustes → Inteligência artificial."
			: "A IA retornou um formato inesperado. Tente outro modelo em Ajustes.";
	}

	if (NoObjectGeneratedError.isInstance(error)) {
		return "O modelo não conseguiu gerar a resposta estruturada. Escolha outro modelo em Ajustes → Inteligência artificial.";
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
