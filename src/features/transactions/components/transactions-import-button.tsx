"use client";

import { RiFileExcel2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import {
	monthToolbarDesktopActionClassName,
	monthToolbarIconClassName,
	monthToolbarMobileCellClassName,
	monthToolbarMobileLabelClassName,
} from "@/features/transactions/lib/month-toolbar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";

export function TransactionsImportButton({
	href = "/transactions/import",
}: {
	href?: string;
}) {
	const router = useRouter();

	return (
		<Button
			type="button"
			variant="ghost"
			onClick={() => {
				router.push(href);
				router.refresh();
			}}
			className={cn(
				monthToolbarMobileCellClassName,
				monthToolbarDesktopActionClassName,
				"md:w-auto md:gap-2 md:border-dashed md:text-sm",
			)}
			aria-label="Importar extrato"
		>
			<RiFileExcel2Line className={monthToolbarIconClassName} aria-hidden />
			<span className={cn(monthToolbarMobileLabelClassName, "md:hidden")}>
				Importar
			</span>
			<span className="hidden md:inline">Importar</span>
		</Button>
	);
}
