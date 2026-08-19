import { z } from "zod";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type { ImportDuplicateValidation } from "@/features/transactions/lib/import-duplicate-match";
import type {
	ReviewInstallmentImport,
	ReviewRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import {
	buildInvoiceExtraReviewRowKey,
	isInvoiceExtraReviewRow,
} from "@/features/transactions/lib/import-invoice-extra-rows";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";

const importDuplicateMismatchDraftSchema = z.object({
	field: z.enum(["date", "amount", "description", "type", "installment"]),
	label: z.string(),
	imported: z.string(),
	existing: z.string(),
});

const importDuplicateValidationDraftSchema = z.object({
	status: z.enum(["match", "mismatch", "link_suggestion"]),
	matchScore: z.object({
		date: z.boolean(),
		amount: z.boolean(),
		description: z.boolean(),
	}),
	mismatches: z.array(importDuplicateMismatchDraftSchema),
	existingTransactionId: z.string().uuid(),
	existingPayerId: z.string().uuid().nullable(),
	existingCategoryId: z.string().uuid().nullable(),
});

const reviewInstallmentImportSchema = z.object({
	enabled: z.boolean(),
	name: z.string(),
	currentInstallment: z.number().int(),
	installmentCount: z.number().int(),
});

const reviewRecurrenceImportSchema = z.object({
	enabled: z.boolean(),
	recurrenceCount: z.number().int(),
});

const importBatchDraftRowSchema = z.object({
	key: z.string().min(1),
	selected: z.boolean(),
	categoryId: z.string().uuid().nullable(),
	payerId: z.string().uuid().nullable(),
	kind: z.enum(["transaction", "invoice_payment", "transfer", "invoice_extra"]),
	existingTransactionId: z.string().uuid().nullable().optional(),
	invoicePaymentCardId: z.string().uuid().nullable(),
	invoicePaymentPeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable(),
	transferPeerAccountId: z.string().uuid().nullable().optional(),
	installmentImport: reviewInstallmentImportSchema.nullable(),
	recurrenceImport: reviewRecurrenceImportSchema.nullable(),
	description: z.string().optional(),
	transactionType: z.enum(["income", "expense"]).optional(),
	isDuplicate: z.boolean().optional(),
	reimported: z.boolean().optional(),
	linked: z.boolean().optional(),
	linkedTransactionId: z.string().uuid().nullable().optional(),
	amount: z.number().optional(),
	existingAmountCorrection: z
		.object({
			transactionId: z.string().uuid(),
			amount: z.number(),
		})
		.nullable()
		.optional(),
	originalKey: z.string().optional(),
	duplicateValidation: importDuplicateValidationDraftSchema
		.nullable()
		.optional(),
});

export const importBatchDraftDataSchema = z.object({
	version: z.literal(1),
	payerId: z.string().uuid().nullable(),
	accountCardValue: z.string().nullable(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable(),
	paymentAccountId: z.string().uuid().nullable(),
	paymentDate: z.string(),
	rows: z.array(importBatchDraftRowSchema),
});

export type ImportBatchDraftData = z.infer<typeof importBatchDraftDataSchema>;
export type ImportBatchDraftRow = z.infer<typeof importBatchDraftRowSchema>;

export function buildImportReviewRowKey(row: {
	externalId: string | null;
	date: string;
	amount: number;
	description: string;
	sourceDescription?: string;
}): string {
	if (row.externalId) {
		return `fit:${row.externalId}`;
	}

	const descriptionForKey = row.sourceDescription ?? row.description;

	return `sem:${row.date}|${row.amount}|${normalizeDescriptionKey(descriptionForKey)}`;
}

export function buildImportBatchDraft(input: {
	payerId: string | null;
	accountCardValue: string | null;
	invoicePeriod: string | null;
	paymentAccountId: string | null;
	paymentDate: string;
	rows: ReviewRow[];
}): ImportBatchDraftData {
	return {
		version: 1,
		payerId: input.payerId,
		accountCardValue: input.accountCardValue,
		invoicePeriod: input.invoicePeriod,
		paymentAccountId: input.paymentAccountId,
		paymentDate: input.paymentDate,
		rows: input.rows.map((row) => {
			const key =
				row.originalDraftKey ??
				(row.kind === "invoice_extra" && row.existingTransactionId
					? buildInvoiceExtraReviewRowKey(row.existingTransactionId)
					: buildImportReviewRowKey(row));
			return {
				key,
				originalKey: key,
				amount: row.amount,
				existingAmountCorrection: row.existingAmountCorrection ?? null,
				selected: row.selected,
				categoryId: row.categoryId,
				payerId: row.payerId,
				kind: row.kind,
				existingTransactionId: row.existingTransactionId ?? null,
				invoicePaymentCardId: row.invoicePaymentCardId,
				invoicePaymentPeriod: row.invoicePaymentPeriod,
				transferPeerAccountId: row.transferPeerAccountId,
				installmentImport: row.installmentImport,
				recurrenceImport: row.recurrenceImport,
				description:
					row.description.trim().length > 0 ? row.description : undefined,
				transactionType: row.transactionType,
				isDuplicate: row.isDuplicate,
				reimported: row.reimported,
				linked: row.linked ?? false,
				linkedTransactionId: row.linked
					? (row.linkedTransactionId ??
						row.duplicateValidation?.existingTransactionId ??
						null)
					: null,
				duplicateValidation: row.linked ? null : row.duplicateValidation,
			};
		}),
	};
}

export function parseImportBatchDraftData(
	value: unknown,
): ImportBatchDraftData | null {
	const parsed = importBatchDraftDataSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export function applyImportBatchDraftToRows(
	rows: ReviewRow[],
	draftData: ImportBatchDraftData,
): ReviewRow[] {
	const draftByKey = new Map(
		draftData.rows.map((row) => [row.originalKey ?? row.key, row]),
	);

	return rows.map((row) => {
		const draft =
			(row.originalDraftKey ? draftByKey.get(row.originalDraftKey) : null) ??
			draftByKey.get(
				row.kind === "invoice_extra" && row.existingTransactionId
					? buildInvoiceExtraReviewRowKey(row.existingTransactionId)
					: buildImportReviewRowKey(row),
			) ??
			draftByKey.get(buildImportReviewRowKey(row)) ??
			(row.description !== row.sourceDescription
				? draftByKey.get(
						buildImportReviewRowKey({
							externalId: row.externalId,
							date: row.date,
							amount: row.amount,
							description: row.description,
						}),
					)
				: null);
		if (!draft) return row;

		const linked = draft.linked ?? false;
		const linkedTransactionId = linked
			? (draft.linkedTransactionId ?? null)
			: null;
		const isDuplicate = linked
			? false
			: draft.isDuplicate === false
				? false
				: draft.isDuplicate === true
					? row.isDuplicate
					: row.isDuplicate;

		const duplicateValidation: ImportDuplicateValidation | null = linked
			? null
			: draft.duplicateValidation != null
				? draft.duplicateValidation
				: isDuplicate
					? row.duplicateValidation
					: null;

		return {
			...row,
			amount: draft.amount ?? row.amount,
			existingAmountCorrection:
				draft.existingAmountCorrection ?? row.existingAmountCorrection ?? null,
			originalDraftKey: draft.originalKey ?? row.originalDraftKey,
			selected: linked ? false : draft.selected,
			categoryId: draft.categoryId,
			payerId: draft.payerId,
			kind: draft.kind,
			invoicePaymentCardId: draft.invoicePaymentCardId,
			invoicePaymentPeriod: draft.invoicePaymentPeriod,
			transferPeerAccountId: draft.transferPeerAccountId ?? null,
			installmentImport:
				draft.installmentImport as ReviewInstallmentImport | null,
			recurrenceImport: draft.recurrenceImport as ReviewRecurrenceImport | null,
			description: draft.description ?? row.description,
			transactionType: draft.transactionType ?? row.transactionType,
			isDuplicate,
			duplicateValidation,
			reimported: draft.reimported ?? row.reimported,
			linked,
			linkedTransactionId,
		};
	});
}

export type ImportBatchDraftGlobals = Pick<
	ImportBatchDraftData,
	| "payerId"
	| "accountCardValue"
	| "invoicePeriod"
	| "paymentAccountId"
	| "paymentDate"
>;

export function extractImportBatchDraftGlobals(
	draftData: ImportBatchDraftData,
): ImportBatchDraftGlobals {
	return {
		payerId: draftData.payerId,
		accountCardValue: draftData.accountCardValue,
		invoicePeriod: draftData.invoicePeriod,
		paymentAccountId: draftData.paymentAccountId,
		paymentDate: draftData.paymentDate,
	};
}

/**
 * Restaura o rascunho só nas linhas de excesso (kind "invoice_extra").
 *
 * Essas linhas só existem depois do fechamento da fatura — a primeira aplicação
 * do rascunho, feita antes do fechamento, não tem como alcançá-las. Reaplicar o
 * rascunho em TODAS as linhas para chegar até elas tinha um efeito colateral: o
 * rascunho pode ter sido salvo antes do fechamento decidir o que conferir e o que
 * importar, e `selected`/`categoryId`/`payerId` do rascunho antigo sobrescreviam
 * a decisão fresca do fechamento — a fatura reabria como se nada tivesse sido
 * resolvido, mesmo com o fechamento tendo acertado tudo.
 */
export function applyImportBatchDraftToExtraRows(
	rows: ReviewRow[],
	draftData: ImportBatchDraftData,
): ReviewRow[] {
	const drafted = applyImportBatchDraftToRows(rows, draftData);
	return rows.map((row, index) =>
		isInvoiceExtraReviewRow(row) ? drafted[index] : row,
	);
}
