import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";
import { ActionError } from "@/shared/lib/actions/action-error";
import { handleActionError } from "@/shared/lib/actions/helpers";

function captureRedirectError(path: string): unknown {
	try {
		redirect(path);
	} catch (error) {
		return error;
	}

	throw new Error("redirect() não lançou");
}

describe("handleActionError", () => {
	it("relança o redirect do login em vez de virar toast genérico", () => {
		const redirectError = captureRedirectError("/login");

		expect(() => handleActionError(redirectError)).toThrow();
	});

	it("mantém a mensagem acionável de ActionError", () => {
		expect(
			handleActionError(new ActionError("Cartão não encontrado.")),
		).toEqual({
			success: false,
			error: "Cartão não encontrado.",
		});
	});

	it("usa mensagem genérica para erro inesperado", () => {
		expect(handleActionError(new Error("stack interno"))).toEqual({
			success: false,
			error: "Ocorreu um erro inesperado. Tente novamente.",
		});
	});
});
