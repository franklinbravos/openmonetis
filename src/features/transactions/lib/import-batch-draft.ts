import { z } from "zod";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type {
	ReviewInstallmentImport,
	ReviewRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";

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
	kind: z.enum(["transaction", "invoice_payment"]),
	invoicePaymentCardId: z.string().uuid().nullable(),
	invoicePaymentPeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable(),
	installmentImport: reviewInstallmentImportSchema.nullable(),
	recurrenceImport: reviewRecurrenceImportSchema.nullable(),
	description: z.string().optional(),
	transactionType: z.enum(["income", "expense"]).optional(),
	isDuplicate: z.boolean().optional(),
	reimported: z.boolean().optional(),
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
}): string {
	if (row.externalId) {
		return `fit:${row.externalId}`;
	}

	return `sem:${row.date}|${row.amount}|${normalizeDescriptionKey(row.description)}`;
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
		rows: input.rows.map((row) => ({
			key: buildImportReviewRowKey(row),
			selected: row.selected,
			categoryId: row.categoryId,
			payerId: row.payerId,
			kind: row.kind,
			invoicePaymentCardId: row.invoicePaymentCardId,
			invoicePaymentPeriod: row.invoicePaymentPeriod,
			installmentImport: row.installmentImport,
			recurrenceImport: row.recurrenceImport,
			description:
				row.description.trim().length > 0 ? row.description : undefined,
			transactionType: row.transactionType,
			isDuplicate: row.isDuplicate,
			reimported: row.reimported,
		})),
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
	const draftByKey = new Map(draftData.rows.map((row) => [row.key, row]));

	return rows.map((row) => {
		const draft = draftByKey.get(buildImportReviewRowKey(row));
		if (!draft) return row;

		const isDuplicate =
			draft.isDuplicate === false
				? false
				: draft.isDuplicate === true
					? row.isDuplicate
					: row.isDuplicate;

		return {
			...row,
			selected: draft.selected,
			categoryId: draft.categoryId,
			payerId: draft.payerId,
			kind: draft.kind,
			invoicePaymentCardId: draft.invoicePaymentCardId,
			invoicePaymentPeriod: draft.invoicePaymentPeriod,
			installmentImport: draft.installmentImport as ReviewInstallmentImport | null,
			recurrenceImport: draft.recurrenceImport as ReviewRecurrenceImport | null,
			description: draft.description ?? row.description,
			transactionType: draft.transactionType ?? row.transactionType,
			isDuplicate,
			duplicateValidation: isDuplicate ? row.duplicateValidation : null,
			reimported: draft.reimported ?? row.reimported,
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
