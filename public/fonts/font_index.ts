import { Caveat, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

export const sans = Instrument_Sans({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-sans",
	fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
	preload: true,
});

export const mono = IBM_Plex_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	display: "swap",
	variable: "--font-mono",
	preload: true,
});

/** Assinatura legível para destaque de nome no dashboard. */
export const signatureFont = Caveat({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-caveat",
	weight: ["500", "600"],
	preload: false,
});

/** @deprecated Use `sans` — mantido para imports legados durante a migração. */
export const inter = sans;
