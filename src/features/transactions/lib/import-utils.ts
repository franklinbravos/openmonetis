export function normalizeDescriptionKey(
	description: string | null | undefined,
): string {
	if (!description) return "";
	return description.toLowerCase().trim().replace(/\s+/g, " ");
}

export const MIN_DESCRIPTION_PREFIX_MATCH_LENGTH = 10;

/** Cartões costumam truncar descrições; aceita prefixo quando um nome é início do outro. */
export function isTruncatedDescriptionMatch(
	importKey: string,
	storedKey: string | null | undefined,
	minLength = MIN_DESCRIPTION_PREFIX_MATCH_LENGTH,
): boolean {
	if (!importKey || !storedKey) return false;
	if (importKey === storedKey) return true;
	if (
		importKey.length >= minLength &&
		storedKey.startsWith(importKey)
	) {
		return true;
	}
	if (
		storedKey.length >= minLength &&
		importKey.startsWith(storedKey)
	) {
		return true;
	}
	return false;
}
