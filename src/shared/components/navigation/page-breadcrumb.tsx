import Link from "next/link";
import { Fragment } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";

export type PageBreadcrumbItem = {
	label: string;
	href?: string;
};

type PageBreadcrumbProps = {
	items: PageBreadcrumbItem[];
	className?: string;
};

export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
	if (items.length === 0) return null;

	return (
		<Breadcrumb className={className}>
			<BreadcrumbList>
				{items.map((item, index) => {
					const isLast = index === items.length - 1;

					return (
						<Fragment key={`${item.label}-${index}`}>
							<BreadcrumbItem>
								{isLast || !item.href ? (
									<BreadcrumbPage>{item.label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link href={item.href}>{item.label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
							{!isLast ? <BreadcrumbSeparator /> : null}
						</Fragment>
					);
				})}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
