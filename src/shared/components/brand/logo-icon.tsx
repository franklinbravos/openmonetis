import type { SVGProps } from "react";
import { useId } from "react";
import { LOGO_MARK } from "@/shared/components/brand/logo-mark-paths";
import { cn } from "@/shared/utils/ui";

/** Ciclo — disco sólido com cifrão recortado e três setas orbitais (grid 48×48). */
export function LogoIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
	const maskId = useId();
	const arrowId = useId();
	const center = LOGO_MARK.viewBox / 2;
	const dollarTransform = `translate(${center} ${center}) scale(${LOGO_MARK.dollarScale}) translate(-${LOGO_MARK.dollarOrigin} -${LOGO_MARK.dollarOrigin})`;

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={`0 0 ${LOGO_MARK.viewBox} ${LOGO_MARK.viewBox}`}
			role="img"
			aria-label="OpenMonetis"
			fill="none"
			className={cn("shrink-0", className)}
			{...props}
		>
			<defs>
				<marker
					id={arrowId}
					markerWidth="10"
					markerHeight="10"
					refX="8"
					refY="5"
					orient="auto"
					markerUnits="userSpaceOnUse"
				>
					<path
						d={LOGO_MARK.orbitArrowMarker}
						fill="none"
						stroke="context-stroke"
						strokeWidth="1.45"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</marker>
				<mask id={maskId}>
					<rect width={LOGO_MARK.viewBox} height={LOGO_MARK.viewBox} fill="white" />
					<g
						transform={dollarTransform}
						stroke="black"
						strokeWidth={LOGO_MARK.stroke.dollarKnockout}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					>
						<path d={LOGO_MARK.dollar} />
					</g>
				</mask>
			</defs>
			<g
				className="text-muted-foreground/85"
				stroke="currentColor"
				strokeWidth={LOGO_MARK.stroke.orbit}
				strokeLinecap="round"
			>
				<g transform="rotate(0 24 24)">
					<path
						d={LOGO_MARK.orbitArc}
						markerEnd={`url(#${arrowId})`}
					/>
				</g>
				<g transform="rotate(120 24 24)">
					<path
						d={LOGO_MARK.orbitArc}
						markerEnd={`url(#${arrowId})`}
					/>
				</g>
				<g transform="rotate(240 24 24)">
					<path
						d={LOGO_MARK.orbitArc}
						markerEnd={`url(#${arrowId})`}
					/>
				</g>
			</g>
			<circle
				className="fill-primary"
				cx={center}
				cy={center}
				r={LOGO_MARK.coreRadius}
				fill="currentColor"
				mask={`url(#${maskId})`}
			/>
		</svg>
	);
}
