import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	applyImportAiPatchesToRows,
	buildImportAiBatchJobs,
	buildImportAiRowEditSnapshots,
	chunkImportAiRowsAdaptive,
	type ImportAiAnalysisRowInput,
	type ImportAiRowPatch,
	isRowEligibleForCategoryAi,
	isRowEligibleForDuplicateAi,
	partitionImportAiRows,
} from "./import-ai-analysis";

function buildRow(
	overrides: Partial<ImportAiAnalysisRowInput> = {},
): ImportAiAnalysisRowInput {
	return {
		rowIndex: 0,
		description: "Mercado",
		sourceDescription: "Mercado",
		amount: 100,
		date: "2026-01-10",
		transactionType: "expense",
		kind: "transaction",
		installment: null,
		installmentImport: null,
		algorithmDuplicate: {
			isDuplicate: false,
			status: null,
			existingTransactionId: null,
		},
		currentCategoryId: null,
		isDuplicate: false,
		selected: true,
		...overrides,
	};
}

describe("partitionImportAiRows", () => {
	it("envia linhas sem categoria para fila de categorias", () => {
		const rows = [buildRow({ rowIndex: 0 }), buildRow({ rowIndex: 1 })];
		const partitioned = partitionImportAiRows(rows);

		expect(partitioned.categoryRows).toHaveLength(2);
		expect(partitioned.duplicateRows).toHaveLength(0);
		expect(partitioned.skippedCount).toBe(0);
	});

	it("pula linhas já categorizadas e com duplicata resolvida", () => {
		const rows = [
			buildRow({
				rowIndex: 0,
				currentCategoryId: "11111111-1111-4111-8111-111111111111",
				isDuplicate: true,
				algorithmDuplicate: {
					isDuplicate: true,
					status: "match",
					existingTransactionId: "22222222-2222-4222-8222-222222222222",
				},
			}),
		];

		const partitioned = partitionImportAiRows(rows);
		expect(partitioned.categoryRows).toHaveLength(0);
		expect(partitioned.duplicateRows).toHaveLength(0);
		expect(partitioned.skippedCount).toBe(1);
	});

	it("envia link_suggestion ambíguo para fila de duplicatas", () => {
		const rows = [
			buildRow({
				rowIndex: 0,
				algorithmDuplicate: {
					isDuplicate: false,
					status: "link_suggestion",
					existingTransactionId: "22222222-2222-4222-8222-222222222222",
				},
			}),
		];

		const partitioned = partitionImportAiRows(rows);
		expect(partitioned.categoryRows).toHaveLength(1);
		expect(partitioned.duplicateRows).toHaveLength(1);
	});
});

describe("isRowEligibleForCategoryAi", () => {
	it("ignora transferências e pagamentos de fatura", () => {
		expect(isRowEligibleForCategoryAi(buildRow({ kind: "transfer" }))).toBe(
			false,
		);
		expect(
			isRowEligibleForCategoryAi(buildRow({ kind: "invoice_payment" })),
		).toBe(false);
	});
});

describe("isRowEligibleForDuplicateAi", () => {
	it("ignora duplicatas já confirmadas pelo algoritmo", () => {
		expect(
			isRowEligibleForDuplicateAi(
				buildRow({
					isDuplicate: true,
					algorithmDuplicate: {
						isDuplicate: true,
						status: "match",
						existingTransactionId: "22222222-2222-4222-8222-222222222222",
					},
				}),
			),
		).toBe(false);
	});
});

describe("chunkImportAiRowsAdaptive", () => {
	it("usa lote menor no primeiro chunk e lotes maiores depois", () => {
		const rows = Array.from({ length: 40 }, (_, index) => index);
		const chunks = chunkImportAiRowsAdaptive(rows);

		expect(chunks[0]).toHaveLength(12);
		expect(chunks[1]).toHaveLength(24);
		expect(chunks[2]).toHaveLength(4);
	});
});

describe("buildImportAiBatchJobs", () => {
	it("prioriza jobs de categoria antes de duplicatas", () => {
		const partitioned = partitionImportAiRows([
			buildRow({ rowIndex: 0 }),
			buildRow({
				rowIndex: 1,
				algorithmDuplicate: {
					isDuplicate: false,
					status: "link_suggestion",
					existingTransactionId: "22222222-2222-4222-8222-222222222222",
				},
			}),
		]);

		const jobs = buildImportAiBatchJobs(partitioned);
		expect(jobs[0]?.analysisMode).toBe("category");
		expect(jobs.some((job) => job.analysisMode === "duplicate")).toBe(true);
	});
});

describe("applyImportAiPatchesToRows manual edit guard", () => {
	const baseReviewRow: ReviewRow = {
		reviewKey: "row-1",
		description: "Mercado",
		sourceDescription: "Mercado",
		amount: 100,
		date: "2026-01-10",
		transactionType: "expense",
		kind: "transaction",
		isDuplicate: false,
		selected: true,
		categoryId: null,
		payerId: null,
		linked: false,
		duplicateValidation: null,
		installmentImport: null,
		recurrenceImport: null,
		transferPeerAccountId: null,
		invoicePaymentCardId: null,
		invoicePaymentPeriod: null,
		externalId: null,
	};

	it("não sobrescreve categoria editada manualmente", () => {
		const rowsAtStart = [{ ...baseReviewRow, categoryId: null }];
		const snapshots = buildImportAiRowEditSnapshots(rowsAtStart);
		const rowsAfterManualEdit: ReviewRow[] = [
			{
				...baseReviewRow,
				categoryId: "33333333-3333-4333-8333-333333333333",
			},
		];
		const patches: ImportAiRowPatch[] = [
			{
				rowIndex: 0,
				categoryId: "44444444-4444-4444-8444-444444444444",
				aiSuggestion: {
					confidence: 0.9,
					category: true,
					note: "Sugestão IA",
				},
			},
		];

		const result = applyImportAiPatchesToRows(rowsAfterManualEdit, patches, {
			rowEditSnapshots: snapshots,
		});

		expect(result[0]?.categoryId).toBe("33333333-3333-4333-8333-333333333333");
		expect(result[0]?.aiSuggestion?.note).toBe("Sugestão IA");
	});
});
