"use client";

import { RiFileExcel2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import {
	monthToolbarIconButtonClassName,
	monthToolbarIconClassName,
} from "@/features/transactions/lib/month-toolbar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";

export function TransactionsImportButton() {
	const router = useRouter();

	return (
		<Button
			type="button"
			variant="outline"
			onClick={() => router.push("/transactions/import")}
			className={cn(
				monthToolbarIconButtonClassName,
				"gap-0 px-0 md:h-9 md:w-auto md:gap-2 md:border-dashed md:px-4 md:text-sm",
			)}
			aria-label="Importar extrato"
		>
			<RiFileExcel2Line
				className={cn(
					monthToolbarIconClassName,
					"md:size-4 md:text-foreground",
				)}
				aria-hidden
			/>
			<span className="hidden md:inline">Importar</span>
			<span className="sr-only md:hidden">Importar extrato</span>
		</Button>
	);
}
