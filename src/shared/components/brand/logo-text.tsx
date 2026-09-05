import type { SVGProps } from "react";

export function LogoText(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 220 32"
			role="img"
			aria-label="OpenMonetis"
			{...props}
		>
			<text
				x="0"
				y="24"
				fill="currentColor"
				fontFamily="var(--font-sans), system-ui, sans-serif"
				fontSize="22"
				fontWeight="600"
				letterSpacing="-0.02em"
			>
				OpenMonetis
			</text>
		</svg>
	);
}
