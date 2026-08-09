import {
	detectInstallmentFromName,
	type InstallmentDetection,
} from "@/features/transactions/lib/installment-detection";
import { addMonthsToPeriod, displayPeriod } from "@/shared/utils/period";

export type ReviewInstallmentImport = {
	enabled: boolean;
	name: string;
	currentInstallment: number;
	installmentCount: number;
};

export type ReviewRecurrenceImport = {
	enabled: boolean;
	recurrenceCount: number;
};

export const DEFAULT_IMPORT_INSTALLMENT_COUNT = 12;
export const DEFAULT_IMPORT_RECURRENCE_COUNT = 12;

export function buildReviewInstallmentImport(
	description: string,
): ReviewInstallmentImport | null {
	const detected = detectInstallmentFromName(description);
	if (!detected) return null;

	return {
		enabled: true,
		name: detected.name,
		currentInstallment: detected.currentInstallment,
		installmentCount: detected.installmentCount,
	};
}

export function createManualInstallmentImport(
	description: string,
): ReviewInstallmentImport {
	return {
		enabled: true,
		name: description.trim(),
		currentInstallment: 1,
		installmentCount: DEFAULT_IMPORT_INSTALLMENT_COUNT,
	};
}

export function createManualRecurrenceImport(): ReviewRecurrenceImport {
	return {
		enabled: true,
		recurrenceCount: DEFAULT_IMPORT_RECURRENCE_COUNT,
	};
}

export function getInstallmentBasePeriod(
	invoicePeriod: string,
	currentInstallment: number,
) {
	return addMonthsToPeriod(invoicePeriod, -(currentInstallment - 1));
}

export function buildInstallmentImportPreview(
	invoicePeriod: string,
	currentInstallment: number,
	installmentCount: number,
) {
	const firstPeriod = getInstallmentBasePeriod(
		invoicePeriod,
		currentInstallment,
	);
	const lastPeriod = addMonthsToPeriod(firstPeriod, installmentCount - 1);

	return {
		firstPeriod,
		lastPeriod,
		firstLabel: displayPeriod(firstPeriod),
		lastLabel: displayPeriod(lastPeriod),
	};
}

export function isValidInstallmentImport(
	installment: ReviewInstallmentImport | null | undefined,
): installment is ReviewInstallmentImport {
	if (!installment?.enabled) return false;

	return (
		installment.installmentCount >= 2 &&
		installment.installmentCount <= 60 &&
		installment.currentInstallment >= 1 &&
		installment.currentInstallment <= installment.installmentCount &&
		installment.name.trim().length > 0
	);
}

export function isValidRecurrenceImport(
	recurrence: ReviewRecurrenceImport | null | undefined,
): recurrence is ReviewRecurrenceImport {
	if (!recurrence?.enabled) return false;

	return recurrence.recurrenceCount >= 2 && recurrence.recurrenceCount <= 60;
}

export function countImportRecords(
	rows: Array<{
		kind?: "transaction" | "invoice_payment" | "transfer";
		installmentImport?: ReviewInstallmentImport | null;
		recurrenceImport?: ReviewRecurrenceImport | null;
	}>,
) {
	return rows.reduce((total, row) => {
		if (row.kind === "transfer") {
			return total + 2;
		}
		if (isValidInstallmentImport(row.installmentImport)) {
			return total + row.installmentImport.installmentCount;
		}
		if (isValidRecurrenceImport(row.recurrenceImport)) {
			return total + row.recurrenceImport.recurrenceCount;
		}
		return total + 1;
	}, 0);
}

export type { InstallmentDetection };
