/** design-token: ALLOWED — cores literais para contextos sem CSS vars (e-mail HTML, confetti). */

/** Paleta índigo derivada de --primary (#3556B1). */
export const CONFETTI_COLORS = [
	"#3556B1",
	"#6C93F4",
	"#A8BEF5",
	"#2A448E",
	"#1E3268",
	"#C5D4F8",
] as const;

/** Tokens de e-mail alinhados ao DESIGN.md (clientes não carregam CSS vars). */
export const EMAIL_COLORS = {
	foreground: "#0f172a",
	foregroundMuted: "#334155",
	foregroundSubtle: "#475569",
	foregroundFaint: "#64748b",
	foregroundDisabled: "#94a3b8",
	border: "#e2e8f0",
	borderSubtle: "#f1f5f9",
	background: "#f8fafc",
	backgroundAlt: "#fcfcfd",
	surface: "#ffffff",
	primary: "#3556B1",
	primaryLight: "#6C93F4",
	primaryForeground: "#ffffff",
	primarySubtle: "#eef2fc",
	primarySubtleText: "#e8edf9",
	positive: "#238077",
	negative: "#AC0D27",
	warning: "#9F6700",
} as const;
