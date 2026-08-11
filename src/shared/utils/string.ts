/**
 * Utility functions for string normalization and manipulation
 */

export function slugify(value: string): string {
	const base = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return base || "item";
}

/**
 * Capitalizes the first letter of a string
 */
export function capitalize(value: string): string {
	return value.length > 0
		? value[0]?.toUpperCase().concat(value.slice(1))
		: value;
}

/**
 * Normalizes optional string - trims and returns null if empty
 * @param value - String to normalize
 * @returns Trimmed string or null if empty
 */
export function normalizeOptionalString(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes file path by extracting filename
 * @param path - File path to normalize
 * @returns Filename without path
 */
export function normalizeFilePath(path: string | null | undefined): string {
	return path?.split("/").filter(Boolean).pop() ?? "";
}

/**
 * Normalizes icon input - trims and returns null if empty
 * @param icon - Icon string to normalize
 * @returns Trimmed icon string or null
 */
export function normalizeIconInput(icon?: string | null): string | null {
	const trimmed = icon?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
}

const UTF8_MOJIBAKE_RE = /\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]/;

export function looksLikeUtf8Mojibake(value: string): boolean {
	return UTF8_MOJIBAKE_RE.test(value);
}

/**
 * Corrige texto UTF-8 que foi interpretado como Latin-1 (ex.: "dÃ©bito" → "débito").
 */
export function fixUtf8Mojibake(value: string): string {
	if (!value || !looksLikeUtf8Mojibake(value)) {
		return value;
	}

	const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
	const recovered = new TextDecoder("utf-8").decode(bytes);
	if (!recovered || recovered === value) {
		return value;
	}

	const countMarkers = (input: string) =>
		(input.match(UTF8_MOJIBAKE_RE) ?? []).length;

	if (countMarkers(recovered) < countMarkers(value)) {
		return recovered;
	}

	return value;
}
