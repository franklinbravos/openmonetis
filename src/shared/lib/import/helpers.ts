import { fixUtf8Mojibake } from "@/shared/utils/string";

const PT_MONTHS: Record<string, number> = {
	janeiro: 1,
	fevereiro: 2,
	março: 3,
	marco: 3,
	abril: 4,
	maio: 5,
	junho: 6,
	julho: 7,
	agosto: 8,
	setembro: 9,
	outubro: 10,
	novembro: 11,
	dezembro: 12,
};

const PT_MONTHS_ABBR: Record<string, number> = {
	jan: 1,
	fev: 2,
	mar: 3,
	abr: 4,
	mai: 5,
	jun: 6,
	jul: 7,
	ago: 8,
	set: 9,
	out: 10,
	nov: 11,
	dez: 12,
};

export function parseBrazilianAmount(raw: string): number {
	const trimmed = raw.trim().replace(/\s/g, "");
	const isNegative = trimmed.startsWith("-");

	const normalized = trimmed
		.replace(/^-/, "")
		.replace(/^R\$/i, "")
		.replace(/\./g, "")
		.replace(",", ".");

	const value = Number.parseFloat(normalized);
	if (Number.isNaN(value)) return 0;
	return isNegative ? -value : value;
}

export function parseSlashDateDMY(raw: string): string | null {
	const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!match) return null;
	return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function parseCnabDate(raw: string): string | null {
	const match = raw.trim().match(/^(\d{2})(\d{2})(\d{4})$/);
	if (!match) return null;
	return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parsePortugueseLongDate(
	day: string,
	monthName: string,
	year: string,
): string | null {
	const month = PT_MONTHS[monthName.toLowerCase()];
	if (!month) return null;
	return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parsePortugueseShortDate(
	day: string,
	monthAbbr: string,
	year: number,
): string | null {
	const month = PT_MONTHS_ABBR[monthAbbr.toLowerCase()];
	if (!month) return null;
	return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parsePortugueseAbbrevDotDate(
	day: string,
	monthAbbr: string,
	year: string,
): string | null {
	const month = PT_MONTHS_ABBR[monthAbbr.replace(/\./g, "").toLowerCase()];
	if (!month) return null;
	return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function buildPeriodFromTransactions(
	transactions: { date: string }[],
): { from: string; to: string } | null {
	if (transactions.length === 0) return null;
	const dates = transactions.map((t) => t.date).sort();
	return { from: dates[0], to: dates[dates.length - 1] };
}

export function makeSyntheticExternalId(parts: string[]): string {
	return parts
		.map((p) => p.trim().toLowerCase())
		.join("|")
		.replace(/\s+/g, " ");
}

export function normalizeImportedText(value: string): string {
	return fixUtf8Mojibake(value).replace(/\s+/g, " ").trim();
}
