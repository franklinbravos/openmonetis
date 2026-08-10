"use client";

import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import Link from "next/link";
import { Button } from "@/shared/components/ui/button";

interface NavigationButtonProps {
	direction: "left" | "right";
	disabled?: boolean;
	href: string;
	onNavigate?: () => void;
}

export default function NavigationButton({
	direction,
	disabled,
	href,
	onNavigate,
}: NavigationButtonProps) {
	const Icon = direction === "left" ? RiArrowLeftSLine : RiArrowRightSLine;
	const label = `Navegar para o mês ${
		direction === "left" ? "anterior" : "seguinte"
	}`;

	if (disabled) {
		return (
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				disabled
				aria-label={label}
			>
				<Icon className="size-5 text-primary" />
			</Button>
		);
	}

	return (
		<Button asChild variant="ghost" size="icon-sm">
			<Link
				href={href}
				replace
				scroll={false}
				aria-label={label}
				onClick={onNavigate}
			>
				<Icon className="size-5 text-primary" />
			</Link>
		</Button>
	);
}
