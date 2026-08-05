import type { ReviewInstallmentImport } from "@/features/transactions/lib/import-installments";
import { detectInstallmentFromName } from "@/features/transactions/lib/installment-detection";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly, toDateOnlyString } from "@/shared/utils/date";

export type ImportDuplicateSnapshot = {
	id: string;
	ofxFitId: string | null;
	name: string;
	amount: string;
	purchaseDate: Date;
	transactionType: string;
	currentInstallment: number | null;
	installmentCount: number | null;
	payerId: string | null;
	categoryId: string | null;
};

export type ImportDuplicateField =
	| "date"
	| "amount"
	| "description"
	| "type"
	| "installment";

export type ImportDuplicateMismatch = {
	field: ImportDuplicateField;
	label: string;
	imported: string;
	existing: string;
};

export type ImportDuplicateValidation = {
	status: "match" | "mismatch";
	mismatches: ImportDuplicateMismatch[];
	existingTransactionId: string;
	existingPayerId: string | null;
	existingCategoryId: string | null;
};

type ImportRowForMatch = Pick<
	ImportedTransaction,
	"date" | "amount" | "description" | "transactionType"
> & {
	installmentImport?: ReviewInstallmentImport | null;
};

type MatchIdentity = {
	baseName: string;
	currentInstallment: number | null;
	installmentCount: number | null;
};

function normalizeDescription(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveImportMatchIdentity(row: ImportRowForMatch): MatchIdentity {
	if (row.installmentImport?.enabled) {
		return {
			baseName: normalizeDescription(row.installmentImport.name),
			currentInstallment: row.installmentImport.currentInstallment,
			installmentCount: row.installmentImport.installmentCount,
		};
	}

	const detected = detectInstallmentFromName(row.description);
	if (detected) {
		return {
			baseName: normalizeDescription(detected.name),
			currentInstallment: detected.currentInstallment,
			installmentCount: detected.installmentCount,
		};
	}

	return {
		baseName: normalizeDescription(row.description),
		currentInstallment: null,
		installmentCount: null,
	};
}

function resolveExistingMatchIdentity(
	existing: ImportDuplicateSnapshot,
): MatchIdentity {
	const detected = detectInstallmentFromName(existing.name);
	if (detected) {
		return {
			baseName: normalizeDescription(detected.name),
			currentInstallment: detected.currentInstallment,
			installmentCount: detected.installmentCount,
		};
	}

	if (existing.currentInstallment && existing.installmentCount) {
		return {
			baseName: normalizeDescription(existing.name),
			currentInstallment: existing.currentInstallment,
			installmentCount: existing.installmentCount,
		};
	}

	return {
		baseName: normalizeDescription(existing.name),
		currentInstallment: null,
		installmentCount: null,
	};
}

function installmentsAreCompatible(
	imported: MatchIdentity,
	existing: MatchIdentity,
): boolean {
	const importedHas =
		imported.currentInstallment != null && imported.installmentCount != null;
	const existingHas =
		existing.currentInstallment != null && existing.installmentCount != null;

	if (!importedHas || !existingHas) {
		return true;
	}

	return (
		imported.currentInstallment === existing.currentInstallment &&
		imported.installmentCount === existing.installmentCount
	);
}

function getImportedDescriptionForMatch(row: ImportRowForMatch): string {
	return resolveImportMatchIdentity(row).baseName;
}

function mapDbTransactionType(value: string): "income" | "expense" {
	return value === "Receita" ? "income" : "expense";
}

function formatTransactionTypeLabel(type: "income" | "expense"): string {
	return type === "income" ? "Receita" : "Despesa";
}

function formatInstallmentLabel(
	current: number | null,
	total: number | null,
): string | null {
	if (!current || !total) return null;
	return `${current}/${total}`;
}

export function findSemanticDuplicateSnapshot(
	row: ImportRowForMatch,
	candidates: ImportDuplicateSnapshot[],
): ImportDuplicateSnapshot | null {
	const importedDate = row.date;
	if (!importedDate) return null;

	const importedAmount = row.amount;
	const importedIdentity = resolveImportMatchIdentity(row);

	for (const existing of candidates) {
		const existingDate = toDateOnlyString(existing.purchaseDate);
		if (existingDate !== importedDate) continue;

		const existingAmount = Math.abs(Number(existing.amount));
		if (Math.abs(importedAmount - existingAmount) > 0.009) continue;

		const existingIdentity = resolveExistingMatchIdentity(existing);
		if (importedIdentity.baseName !== existingIdentity.baseName) continue;

		if (!installmentsAreCompatible(importedIdentity, existingIdentity)) {
			continue;
		}

		return existing;
	}

	return null;
}

export function buildImportDuplicateValidation(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
): ImportDuplicateValidation {
	const mismatches: ImportDuplicateMismatch[] = [];

	const importedDate = row.date;
	const existingDate = toDateOnlyString(existing.purchaseDate);
	if (importedDate && existingDate && importedDate !== existingDate) {
		mismatches.push({
			field: "date",
			label: "Data",
			imported: formatDateOnly(importedDate) ?? importedDate,
			existing: formatDateOnly(existingDate) ?? existingDate,
		});
	}

	const importedAmount = row.amount;
	const existingAmount = Math.abs(Number(existing.amount));
	if (Math.abs(importedAmount - existingAmount) > 0.009) {
		mismatches.push({
			field: "amount",
			label: "Valor",
			imported: formatCurrency(importedAmount),
			existing: formatCurrency(existingAmount),
		});
	}

	const importedType = row.transactionType;
	const existingType = mapDbTransactionType(existing.transactionType);
	if (importedType !== existingType) {
		mismatches.push({
			field: "type",
			label: "Tipo",
			imported: formatTransactionTypeLabel(importedType),
			existing: formatTransactionTypeLabel(existingType),
		});
	}

	if (
		normalizeDescription(getImportedDescriptionForMatch(row)) !==
		normalizeDescription(existing.name)
	) {
		mismatches.push({
			field: "description",
			label: "Descrição",
			imported: getImportedDescriptionForMatch(row).trim(),
			existing: existing.name.trim(),
		});
	}

	if (row.installmentImport?.enabled) {
		const importedIdentity = resolveImportMatchIdentity(row);
		const existingIdentity = resolveExistingMatchIdentity(existing);
		const importedInstallment = formatInstallmentLabel(
			importedIdentity.currentInstallment,
			importedIdentity.installmentCount,
		);
		const existingInstallment = formatInstallmentLabel(
			existingIdentity.currentInstallment,
			existingIdentity.installmentCount,
		);

		if (
			importedInstallment &&
			existingInstallment &&
			importedInstallment !== existingInstallment
		) {
			mismatches.push({
				field: "installment",
				label: "Parcela",
				imported: importedInstallment,
				existing: existingInstallment,
			});
		}
	}

	return {
		status: mismatches.length === 0 ? "match" : "mismatch",
		mismatches,
		existingTransactionId: existing.id,
		existingPayerId: existing.payerId,
		existingCategoryId: existing.categoryId,
	};
}

export function isVerifiedImportDuplicate(row: {
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
	reimported?: boolean;
}): boolean {
	return (
		row.isDuplicate &&
		row.duplicateValidation?.status === "match" &&
		!row.reimported
	);
}
