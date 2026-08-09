"use client";

import { RiPriceTag3Line } from "@remixicon/react";
import type { ComponentType } from "react";
import { getIconComponent, resolveIconName } from "@/shared/utils/icons";
import { cn } from "@/shared/utils/ui";

interface CategoryIconProps {
	name?: string | null;
	className?: string;
}

const FALLBACK_ICON = RiPriceTag3Line;

export function CategoryIcon({ name, className }: CategoryIconProps) {
	const resolvedName = name ? resolveIconName(name) : "RiPriceTag3Line";
	const IconComponent = (getIconComponent(resolvedName) ??
		FALLBACK_ICON) as ComponentType<{ className?: string }>;

	return <IconComponent className={cn("size-5", className)} aria-hidden />;
}
