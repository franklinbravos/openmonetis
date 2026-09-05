/**
 * Paleta de séries categóricas — máximo 5 cores (--chart-1 … --chart-5).
 */
const CHART_PALETTE_SIZE = 5;

export const CATEGORY_COLORS = Array.from(
	{ length: CHART_PALETTE_SIZE },
	(_, index) => `var(--chart-${index + 1})`,
) as readonly string[];

function hashNameToIndex(name: string): number {
	let hash = 0;
	for (let characterIndex = 0; characterIndex < name.length; characterIndex++) {
		hash =
			name.charCodeAt(characterIndex) + ((hash << 5) - hash);
	}
	return Math.abs(hash) % CHART_PALETTE_SIZE;
}

export function getCategoryColorFromName(_name: string): string {
	return "var(--foreground)";
}

export function getCategoryBgColorFromName(name: string): string {
	const paletteIndex = hashNameToIndex(name) + 1;
	return `color-mix(in oklch, var(--chart-${paletteIndex}) 20%, transparent)`;
}

export function buildInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) {
		return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
	}
	const firstInitial = parts[0]?.[0] ?? "";
	const secondInitial = parts[1]?.[0] ?? "";
	return `${firstInitial}${secondInitial}`.toUpperCase() || "?";
}
