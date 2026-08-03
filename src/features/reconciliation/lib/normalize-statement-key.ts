import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";

const TRAILING_REFERENCE_PATTERN = /\s+\d{3,}$/;
const CARD_SUFFIX_PATTERN = /\s+\d{4}$/;

export function normalizeStatementKey(description: string): string {
	const base = normalizeDescriptionKey(description)
		.replace(TRAILING_REFERENCE_PATTERN, "")
		.replace(CARD_SUFFIX_PATTERN, "")
		.replace(/[*#]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	return base;
}
