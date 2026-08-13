import { Caveat, Inter } from "next/font/google";

export const inter = Inter({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-inter",
	fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
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
