import { describe, expect, it } from "vitest";
import { buildImportMountKey } from "@/features/transactions/lib/import-flow-entry";

function buildMountKeyInput(
	overrides: Partial<Parameters<typeof buildImportMountKey>[0]> = {},
): Parameters<typeof buildImportMountKey>[0] {
	return {
		resumeBatchId: null,
		remountNonce: null,
		cardId: null,
		accountId: null,
		invoicePeriod: null,
		...overrides,
	};
}

describe("buildImportMountKey", () => {
	it("identifica o contexto de cartão quando a URL não pede lote", () => {
		expect(
			buildImportMountKey(
				buildMountKeyInput({ cardId: "card-1", invoicePeriod: "2026-02" }),
			),
		).toBe("import:card-1:no-account:2026-02");
	});

	it("marca as lacunas do contexto para não colidir com outro contexto", () => {
		expect(buildImportMountKey(buildMountKeyInput())).toBe(
			"import:no-card:no-account:no-period",
		);
	});

	it("carrega o nonce da retomada para forçar remontagem", () => {
		expect(
			buildImportMountKey(
				buildMountKeyInput({ resumeBatchId: "batch-1", remountNonce: "42-1" }),
			),
		).toBe("resume:batch-1:42-1");
	});

	it("usa zero quando a retomada chega sem nonce", () => {
		expect(
			buildImportMountKey(buildMountKeyInput({ resumeBatchId: "batch-1" })),
		).toBe("resume:batch-1:0");
	});

	it("ignora o contexto quando a URL pede retomada", () => {
		expect(
			buildImportMountKey(
				buildMountKeyInput({
					resumeBatchId: "batch-1",
					remountNonce: "42-1",
					cardId: "card-1",
					invoicePeriod: "2026-02",
				}),
			),
		).toBe("resume:batch-1:42-1");
	});
});
