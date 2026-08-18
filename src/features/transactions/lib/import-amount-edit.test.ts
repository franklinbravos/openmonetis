import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	amountEditToSignedStored,
	applyExistingAmountEdits,
	buildExistingAmountSnapshotMap,
	collectExistingAmountEdits,
	countExistingAmountEdits,
	dedupeExistingAmountEdits,
	enrichReviewRowsWithExistingAmount,
	resolveExistingTransactionIdForAmountEdit,
} from "@/features/transactions/lib/import-amount-edit";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import type { InvoiceReconciliationExistingRow } from "@/shared/lib/import/invoice-total";

const EXISTING_ID = "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function snapshot(
	overrides: Partial<ImportDuplicateSnapshot> &
		Pick<ImportDuplicateSnapshot, "id">,
): ImportDuplicateSnapshot {
	return {
		ofxFitId: null,
		name: "Compra teste",
		amount: "10.00",
		purchaseDate: "2026-07-10",
		transactionType: "Despesa",
		currentInstallment: null,
		installmentCount: null,
		payerId: null,
		categoryId: null,
		...overrides,
	};
}

function fileRow(
	overrides: Partial<ReviewRow> & Pick<ReviewRow, "reviewKey">,
): ReviewRow {
	return {
		externalId: null,
		date: "2026-07-10",
		amount: 10,
		description: "Compra teste",
		sourceDescription: "Compra teste",
		transactionType: "expense",
		selected: true,
		isDuplicate: false,
		duplicateValidation: null,
		categoryId: null,
		payerId: null,
		kind: "transaction",
		invoicePaymentCardId: null,
		invoicePaymentPeriod: null,
		transferPeerAccountId: null,
		installmentImport: null,
		recurrenceImport: null,
		existingTransactionId: null,
		...overrides,
	};
}

function existingRow(
	overrides: Partial<InvoiceReconciliationExistingRow> &
		Pick<InvoiceReconciliationExistingRow, "id">,
): InvoiceReconciliationExistingRow {
	return {
		ofxFitId: null,
		name: "Compra teste",
		amount: "-14.86",
		transactionType: "Despesa",
		...overrides,
	};
}

function matchedValidation(id: string) {
	return {
		status: "match" as const,
		matchScore: { date: true, amount: true, description: true },
		mismatches: [],
		existingTransactionId: id,
		existingPayerId: null,
		existingCategoryId: null,
	};
}

describe("buildExistingAmountSnapshotMap", () => {
	it("mapeia id para valor absoluto do snapshot", () => {
		const map = buildExistingAmountSnapshotMap([
			snapshot({ id: "aaaa", amount: "-14.86" }),
			snapshot({ id: "bbbb", amount: "14.85" }),
		]);

		expect(map.get("aaaa")).toBe(14.86);
		expect(map.get("bbbb")).toBe(14.85);
		expect(map.size).toBe(2);
	});

	it("aceita amount numérico vindo do banco (numeric) além de string", () => {
		const map = buildExistingAmountSnapshotMap([
			snapshot({ id: "string", amount: "14.85" }),
			snapshot({ id: "number", amount: 14.85 as unknown as string }),
		]);

		expect(map.get("string")).toBe(14.85);
		expect(map.get("number")).toBe(14.85);
		expect(map.size).toBe(2);
	});

	it("mantém amount zero vindo como número", () => {
		const map = buildExistingAmountSnapshotMap([
			snapshot({ id: "zero", amount: 0 as unknown as string }),
		]);

		expect(map.get("zero")).toBe(0);
		expect(map.size).toBe(1);
	});

	it("descarta amount numérico NaN", () => {
		const map = buildExistingAmountSnapshotMap([
			snapshot({ id: "nan", amount: Number.NaN as unknown as string }),
		]);

		expect(map.has("nan")).toBe(false);
		expect(map.size).toBe(0);
	});

	it("retorna mapa vazio para lista vazia", () => {
		expect(buildExistingAmountSnapshotMap([]).size).toBe(0);
	});

	it("descarta snapshots com valor não numérico", () => {
		const map = buildExistingAmountSnapshotMap([
			snapshot({ id: "aaaa", amount: "NaN" }),
			snapshot({ id: "bbbb", amount: "sem valor" }),
		]);

		expect(map.has("aaaa")).toBe(false);
		expect(map.has("bbbb")).toBe(false);
		expect(map.size).toBe(0);
	});

	it("descarta valores vazios ou em branco em vez de mapear para zero", () => {
		const map = buildExistingAmountSnapshotMap([
			snapshot({ id: "empty", amount: "" }),
			snapshot({ id: "blank", amount: "   " }),
		]);

		expect(map.has("empty")).toBe(false);
		expect(map.has("blank")).toBe(false);
		expect(map.size).toBe(0);
	});
});

describe("amountEditToSignedStored", () => {
	it("aplica sinal de despesa negativa e receita positiva", () => {
		expect(amountEditToSignedStored(14.85, "Despesa")).toBe(-14.85);
		expect(amountEditToSignedStored(14.85, "Receita")).toBe(14.85);
	});

	it("retorna zero para valor zero", () => {
		expect(amountEditToSignedStored(0, "Despesa")).toBe(0);
	});

	it("retorna zero para valor não finito", () => {
		expect(amountEditToSignedStored(Number.NaN, "Despesa")).toBe(0);
	});
});

describe("resolveExistingTransactionIdForAmountEdit", () => {
	it("devolve o id de invoice_extra não marcada para remoção", () => {
		const row = fileRow({
			reviewKey: "extra-1",
			kind: "invoice_extra",
			existingTransactionId: EXISTING_ID,
			existingAmount: 14.85,
			selected: false,
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBe(EXISTING_ID);
	});

	it("devolve o id do duplicateValidation de duplicata conferida", () => {
		const row = fileRow({
			reviewKey: "confere-1",
			isDuplicate: true,
			existingAmount: 14.86,
			selected: false,
			duplicateValidation: matchedValidation(EXISTING_ID),
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBe(EXISTING_ID);
	});

	it("retorna null sem existingAmount (id fora do período)", () => {
		const row = fileRow({
			reviewKey: "extra-1",
			kind: "invoice_extra",
			existingTransactionId: EXISTING_ID,
			existingAmount: undefined,
			selected: false,
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});

	it("retorna null para invoice_extra marcada para remoção", () => {
		const row = fileRow({
			reviewKey: "extra-1",
			kind: "invoice_extra",
			existingTransactionId: EXISTING_ID,
			existingAmount: 14.86,
			selected: true,
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});

	it("retorna null para pagamento de fatura", () => {
		const row = fileRow({
			reviewKey: "payment-1",
			kind: "invoice_payment",
			existingAmount: 14.86,
			invoicePaymentCardId: "cccc-cccc-cccc-cccc-cccccccccccc",
			invoicePaymentPeriod: "2026-02",
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});

	it("retorna null para transferência", () => {
		const row = fileRow({
			reviewKey: "transfer-1",
			kind: "transfer",
			existingAmount: 14.86,
			transferPeerAccountId: "cccc-cccc-cccc-cccc-cccccccccccc",
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});

	it("retorna null para linha vinculada", () => {
		const row = fileRow({
			reviewKey: "linked-1",
			linked: true,
			linkedTransactionId: EXISTING_ID,
			existingAmount: 14.86,
			duplicateValidation: null,
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});

	it("retorna null para link_suggestion pendente", () => {
		const row = fileRow({
			reviewKey: "suggestion-1",
			isDuplicate: false,
			existingAmount: 14.86,
			duplicateValidation: {
				status: "link_suggestion",
				matchScore: { date: true, amount: true, description: false },
				mismatches: [],
				existingTransactionId: EXISTING_ID,
				existingPayerId: null,
				existingCategoryId: null,
			},
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});

	it("retorna null para linha reimportada", () => {
		const row = fileRow({
			reviewKey: "reimported-1",
			isDuplicate: true,
			reimported: true,
			existingAmount: 14.86,
			duplicateValidation: matchedValidation(EXISTING_ID),
		});

		expect(resolveExistingTransactionIdForAmountEdit(row)).toBeNull();
	});
});

describe("enrichReviewRowsWithExistingAmount", () => {
	it("preenche existingAmount apenas para ids do mapa do período", () => {
		const rows = [
			fileRow({
				reviewKey: "matched-1",
				isDuplicate: true,
				duplicateValidation: matchedValidation(EXISTING_ID),
			}),
			fileRow({
				reviewKey: "extra-1",
				kind: "invoice_extra",
				existingTransactionId: EXISTING_ID,
			}),
			fileRow({
				reviewKey: "out-period-1",
				existingTransactionId: "zzzz-bbbb-cccc-dddd-eeeeeeeeeeee",
			}),
			fileRow({ reviewKey: "new-1" }),
		];

		const enriched = enrichReviewRowsWithExistingAmount(
			rows,
			new Map([[EXISTING_ID, 14.86]]),
		);

		expect(enriched[0]?.existingAmount).toBe(14.86);
		expect(enriched[1]?.existingAmount).toBe(14.86);
		expect(enriched[2]?.existingAmount).toBeNull();
		expect(enriched[3]).toBe(rows[3]);
	});

	it("limpa existingAmount quando o id sai do mapa do período (W1)", () => {
		const staleRow = fileRow({
			reviewKey: "cross-period-1",
			isDuplicate: true,
			existingAmount: 14.86,
			duplicateValidation: matchedValidation(EXISTING_ID),
		});

		const [enriched] = enrichReviewRowsWithExistingAmount(
			[staleRow],
			new Map<string, number>(),
		);

		expect(enriched).toBeDefined();
		if (enriched) {
			expect(enriched.existingAmount).toBeNull();
			expect(resolveExistingTransactionIdForAmountEdit(enriched)).toBeNull();
		}
	});

	it("preserva amount e existingAmountCorrection ao enriquecer", () => {
		const row = fileRow({
			reviewKey: "dup-1",
			amount: 260,
			isDuplicate: true,
			existingAmountCorrection: {
				transactionId: EXISTING_ID,
				amount: 261,
			},
			duplicateValidation: matchedValidation(EXISTING_ID),
		});

		const [enriched] = enrichReviewRowsWithExistingAmount(
			[row],
			new Map([[EXISTING_ID, 260]]),
		);

		expect(enriched?.existingAmount).toBe(260);
		expect(enriched?.amount).toBe(260);
		expect(enriched?.existingAmountCorrection).toEqual({
			transactionId: EXISTING_ID,
			amount: 261,
		});
	});
});

describe("collectExistingAmountEdits", () => {
	it("coleta correções apenas de linhas editáveis", () => {
		const rows = [
			fileRow({
				reviewKey: "editable-1",
				kind: "invoice_extra",
				existingTransactionId: EXISTING_ID,
				existingAmount: 14.86,
				selected: false,
				existingAmountCorrection: {
					transactionId: EXISTING_ID,
					amount: 14.85,
				},
			}),
			fileRow({
				reviewKey: "removed-1",
				kind: "invoice_extra",
				existingTransactionId: EXISTING_ID,
				existingAmount: 14.86,
				selected: true,
				existingAmountCorrection: {
					transactionId: EXISTING_ID,
					amount: 2,
				},
			}),
			fileRow({ reviewKey: "no-correction-1" }),
		];

		expect(collectExistingAmountEdits(rows)).toEqual([
			{ transactionId: EXISTING_ID, amount: 14.85 },
		]);
		expect(countExistingAmountEdits(rows)).toBe(1);
	});
});

describe("dedupeExistingAmountEdits", () => {
	it("remove ids duplicados mantendo uma única entrada com o último valor", () => {
		const edits = [
			{ transactionId: EXISTING_ID, amount: 14.85 },
			{ transactionId: EXISTING_ID, amount: 14.86 },
		];

		expect(dedupeExistingAmountEdits(edits)).toEqual([
			{ transactionId: EXISTING_ID, amount: 14.86 },
		]);
	});

	it("retorna lista vazia para entrada vazia", () => {
		expect(dedupeExistingAmountEdits([])).toEqual([]);
	});

	it("último valor vence e a ordem das primeiras ocorrências é preservada", () => {
		const edits = [
			{ transactionId: "aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", amount: 1 },
			{ transactionId: "bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", amount: 2 },
			{ transactionId: "aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", amount: 3 },
			{ transactionId: "cccc-cccc-cccc-cccc-cccccccccccc", amount: 4 },
			{ transactionId: "bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", amount: 5 },
		];

		expect(dedupeExistingAmountEdits(edits)).toEqual([
			{ transactionId: "aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", amount: 3 },
			{ transactionId: "bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", amount: 5 },
			{ transactionId: "cccc-cccc-cccc-cccc-cccccccccccc", amount: 4 },
		]);
	});
});

describe("applyExistingAmountEdits", () => {
	it("sobrescreve o amount com o sinal do tipo de transação", () => {
		const rows = [existingRow({ id: EXISTING_ID })];

		const applied = applyExistingAmountEdits(rows, [
			{ transactionId: EXISTING_ID, amount: 14.85 },
		]);

		expect(applied).not.toBe(rows);
		expect(applied[0]?.amount).toBe(-14.85);
	});

	it("ignora edições de ids ausentes sem alterar as linhas (W1)", () => {
		const rows = [existingRow({ id: EXISTING_ID })];

		const applied = applyExistingAmountEdits(rows, [
			{ transactionId: "zzzz-bbbb-cccc-dddd-eeeeeeeeeeee", amount: 1 },
		]);

		expect(applied).not.toBe(rows);
		expect(applied).toEqual(rows);
		expect(applied[0]?.amount).toBe("-14.86");
	});

	it("aplica valor absoluto positivo para receita", () => {
		const rows = [
			existingRow({
				id: EXISTING_ID,
				amount: "14.86",
				transactionType: "Receita",
			}),
		];

		const applied = applyExistingAmountEdits(rows, [
			{ transactionId: EXISTING_ID, amount: -14.85 },
		]);

		expect(applied[0]?.amount).toBe(14.85);
	});
});
