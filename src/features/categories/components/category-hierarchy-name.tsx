"use client";

import { RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { cn } from "@/shared/utils/ui";

type CategoryHierarchyNameProps = {
	name: string;
	href: string;
	depth: number;
	ancestorPath?: string | null;
};

export function CategoryHierarchyName({
	name,
	href,
	depth,
	ancestorPath,
}: CategoryHierarchyNameProps) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex min-w-0 flex-col gap-0.5 underline-offset-2 hover:text-primary hover:underline",
				depth === 0 ? "font-semibold" : "font-medium",
			)}
		>
			<span className="inline-flex items-center gap-1">
				<span className="truncate">{name}</span>
				<RiExternalLinkLine
					className="size-3 shrink-0 text-muted-foreground"
					aria-hidden
				/>
			</span>
			{ancestorPath ? (
				<span className="truncate font-normal text-muted-foreground text-xs">
					{ancestorPath}
				</span>
			) : null}
		</Link>
	);
}
