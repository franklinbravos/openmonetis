"use client";

import { usePathname } from "next/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";
import { NavLink } from "./nav-link";

type NavPillProps = {
	href: string;
	preservePeriod?: boolean;
	children: React.ReactNode;
};

export function NavPill({ href, preservePeriod, children }: NavPillProps) {
	const pathname = usePathname();

	const isActive =
		href === "/dashboard"
			? pathname === href
			: pathname === href || pathname.startsWith(`${href}/`);

	return (
		<NavLink
			href={href}
			preservePeriod={preservePeriod}
			className={cn(
				buttonVariants({ variant: "navbar", size: "sm" }),
				"h-9 capitalize text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/40",
				isActive && "bg-primary-subtle font-medium text-primary",
			)}
		>
			{children}
		</NavLink>
	);
}
