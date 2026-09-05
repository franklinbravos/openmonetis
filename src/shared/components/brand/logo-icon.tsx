import type { SVGProps } from "react";

/** Sinal — glifos + e − fundidos (grid 24×24, traço 4u). */
export function LogoIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			role="img"
			aria-label="OpenMonetis"
			{...props}
		>
			<rect x="4" y="10" width="16" height="4" rx="1" fill="currentColor" />
			<rect x="10" y="4" width="4" height="10" rx="1" fill="currentColor" />
		</svg>
	);
}
