import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import {
	resolveFallbackModelId,
	shouldRetryWithFallbackModel,
} from "@/shared/lib/ai/fallback-model";
import { isProviderQuotaExhausted } from "@/shared/lib/ai/format-ai-action-error";

function apiError(statusCode: number, message = "falhou"): APICallError {
	return new APICallError({
		message,
		url: "https://provedor.exemplo/v1/chat",
		requestBodyValues: {},
		statusCode,
	});
}

describe("shouldRetryWithFallbackModel", () => {
	it("troca de modelo quando a cota estoura (429)", () => {
		expect(shouldRetryWithFallbackModel(apiError(429))).toBe(true);
	});

	it("troca quando o provedor está fora do ar (5xx)", () => {
		expect(shouldRetryWithFallbackModel(apiError(503))).toBe(true);
	});

	it("troca quando o modelo não existe no provedor (404)", () => {
		expect(shouldRetryWithFallbackModel(apiError(404))).toBe(true);
	});

	it("não troca quando a chave foi rejeitada: erro de configuração deve aparecer", () => {
		expect(shouldRetryWithFallbackModel(apiError(401))).toBe(false);
		expect(shouldRetryWithFallbackModel(apiError(403))).toBe(false);
	});

	it("não troca em erro comum", () => {
		expect(shouldRetryWithFallbackModel(new Error("qualquer coisa"))).toBe(
			false,
		);
	});
});

describe("resolveFallbackModelId", () => {
	it("usa a reserva configurada", () => {
		expect(
			resolveFallbackModelId({
				primaryModelId: "deepseek-v4-flash",
				fallbackModelId: "gpt-5-mini",
			}),
		).toBe("gpt-5-mini");
	});

	it("ignora reserva igual ao principal", () => {
		expect(
			resolveFallbackModelId({
				primaryModelId: "gpt-5-mini",
				fallbackModelId: "gpt-5-mini",
			}),
		).toBeNull();
	});

	it("ignora reserva vazia ou ausente", () => {
		expect(
			resolveFallbackModelId({ primaryModelId: "a", fallbackModelId: "  " }),
		).toBeNull();
		expect(
			resolveFallbackModelId({ primaryModelId: "a", fallbackModelId: null }),
		).toBeNull();
	});
});

describe("isProviderQuotaExhausted", () => {
	it("reconhece cota semanal esgotada", () => {
		expect(
			isProviderQuotaExhausted({
				message:
					"Weekly usage limit reached. Resets in 4 days. To continue using this model now, enable usage from your available balance",
			}),
		).toBe(true);
	});

	it("reconhece cota do provedor pelo corpo da resposta", () => {
		expect(
			isProviderQuotaExhausted({
				message: "HTTP 429",
				responseBody: '{"error":{"code":"insufficient_quota"}}',
			}),
		).toBe(true);
	});

	it("não confunde com limite por minuto", () => {
		expect(
			isProviderQuotaExhausted({
				message: "Rate limit exceeded, please slow down",
			}),
		).toBe(false);
	});
});
