import { describe, expect, it } from "vitest";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import {
	formatImportEntryContext,
	resolveImportEntryActionLabel,
} from "@/features/transactions/lib/import-file-history-entry";

function buildEntry(
	overrides: Partial<ImportFileHistoryEntry> = {},
): ImportFileHistoryEntry {
	return {
		id: "batch-1",
		sourceFileName: "fatura.pdf",
		sourceFileSize: 2048,
		importedCount: 12,
		skippedCount: 0,
		status: IMPORT_BATCH_STATUS.IMPORTED,
		createdAt: new Date("2026-02-10T12:00:00.000Z"),
		hasAttachment: true,
		cardId: "card-1",
		invoicePeriod: "2026-02",
		cardName: "Nubank",
		accountId: null,
		accountName: null,
		...overrides,
	};
}

describe("formatImportEntryContext", () => {
	it("combina cartão e período quando ambos existem", () => {
		expect(formatImportEntryContext(buildEntry())).toBe(
			"Nubank · Fevereiro de 2026",
		);
	});

	it("usa o nome da conta quando não há cartão", () => {
		expect(
			formatImportEntryContext(
				buildEntry({
					cardId: null,
					cardName: null,
					invoicePeriod: null,
					accountId: "account-1",
					accountName: "Conta corrente",
				}),
			),
		).toBe("Conta corrente");
	});

	it("prioriza cartão sobre conta quando os dois estão presentes", () => {
		expect(
			formatImportEntryContext(
				buildEntry({ accountId: "account-1", accountName: "Conta corrente" }),
			),
		).toBe("Nubank · Fevereiro de 2026");
	});

	it("cai para a conta quando o cartão não tem período", () => {
		expect(
			formatImportEntryContext(
				buildEntry({ invoicePeriod: null, accountName: "Conta corrente" }),
			),
		).toBe("Conta corrente");
	});

	it("cai para a conta quando há período sem cartão", () => {
		expect(
			formatImportEntryContext(
				buildEntry({ cardName: null, accountName: "Conta corrente" }),
			),
		).toBe("Conta corrente");
	});

	it("retorna null quando não há contexto algum", () => {
		expect(
			formatImportEntryContext(
				buildEntry({ cardName: null, invoicePeriod: null }),
			),
		).toBeNull();
	});

	it("preserva string vazia da conta sem convertê-la em null", () => {
		expect(
			formatImportEntryContext(
				buildEntry({ cardName: null, invoicePeriod: null, accountName: "" }),
			),
		).toBe("");
	});

	it("ignora cartão com nome vazio e usa a conta", () => {
		expect(
			formatImportEntryContext(
				buildEntry({ cardName: "", accountName: "Conta corrente" }),
			),
		).toBe("Conta corrente");
	});

	it("propaga erro de período inválido vindo do banco", () => {
		expect(() =>
			formatImportEntryContext(buildEntry({ invoicePeriod: "2026-13" })),
		).toThrow("Período inválido: 2026-13");
	});
});

describe("resolveImportEntryActionLabel", () => {
	it("oferece continuar quando há rascunho salvo", () => {
		expect(
			resolveImportEntryActionLabel(
				buildEntry({ status: IMPORT_BATCH_STATUS.DRAFT }),
			),
		).toBe("Continuar");
	});

	it("oferece reprocessar quando o upload parou antes da revisão", () => {
		expect(
			resolveImportEntryActionLabel(
				buildEntry({ status: IMPORT_BATCH_STATUS.UPLOADED }),
			),
		).toBe("Reprocessar");
	});

	it("pede o arquivo de novo quando ele não está salvo", () => {
		expect(
			resolveImportEntryActionLabel(
				buildEntry({
					status: IMPORT_BATCH_STATUS.UPLOADED,
					hasAttachment: false,
				}),
			),
		).toBe("Reenviar arquivo");
	});

	it("prefere continuar a reprocessar quando o rascunho tem arquivo salvo", () => {
		expect(
			resolveImportEntryActionLabel(
				buildEntry({ status: IMPORT_BATCH_STATUS.DRAFT, hasAttachment: true }),
			),
		).toBe("Continuar");
	});
});
