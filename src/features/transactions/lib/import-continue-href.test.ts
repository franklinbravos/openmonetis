import { describe, expect, it } from "vitest";
import {
	buildImportHrefWithoutFlowParams,
	buildImportResumeHref,
} from "@/features/transactions/lib/import-continue-href";

function parseHrefParams(href: string): URLSearchParams {
	return new URLSearchParams(href.split("?")[1] ?? "");
}

describe("buildImportResumeHref", () => {
	it("mantém o lote de origem e pede remontagem", () => {
		const params = parseHrefParams(
			buildImportResumeHref({
				id: "batch-1",
				cardId: "card-1",
				invoicePeriod: "2026-02",
				accountId: null,
			}),
		);

		expect(params.get("cartao")).toBe("card-1");
		expect(params.get("periodo")).toBe("2026-02");
		expect(params.get("lote")).toBe("batch-1");
		expect(params.get("retomar")).not.toBeNull();
	});

	it("leva a conta quando o lote não é de cartão", () => {
		const params = parseHrefParams(
			buildImportResumeHref({
				id: "batch-2",
				cardId: null,
				invoicePeriod: null,
				accountId: "account-1",
			}),
		);

		expect(params.get("conta")).toBe("account-1");
		expect(params.get("cartao")).toBeNull();
		expect(params.get("lote")).toBe("batch-2");
	});

	it("gera nonce de remontagem diferente a cada chamada", () => {
		const entry = {
			id: "batch-1",
			cardId: null,
			invoicePeriod: null,
			accountId: null,
		};

		expect(
			parseHrefParams(buildImportResumeHref(entry)).get("retomar"),
		).not.toBe(parseHrefParams(buildImportResumeHref(entry)).get("retomar"));
	});
});

describe("buildImportHrefWithoutFlowParams", () => {
	it("remove as instruções de entrada e preserva o contexto", () => {
		expect(
			buildImportHrefWithoutFlowParams({
				pathname: "/transactions/import",
				search: "?cartao=card-1&periodo=2026-02&lote=batch-1&retomar=42-1",
			}),
		).toBe("/transactions/import?cartao=card-1&periodo=2026-02");
	});

	it("remove o nonce mesmo sem lote na URL", () => {
		expect(
			buildImportHrefWithoutFlowParams({
				pathname: "/transactions/import",
				search: "?conta=account-1&retomar=42-1",
			}),
		).toBe("/transactions/import?conta=account-1");
	});

	it("devolve o pathname sem interrogação quando nada sobra", () => {
		expect(
			buildImportHrefWithoutFlowParams({
				pathname: "/transactions/import",
				search: "?lote=batch-1&retomar=42-1",
			}),
		).toBe("/transactions/import");
	});

	it("é idempotente numa URL que já não tem instruções", () => {
		expect(
			buildImportHrefWithoutFlowParams({
				pathname: "/transactions/import",
				search: "",
			}),
		).toBe("/transactions/import");
	});
});
