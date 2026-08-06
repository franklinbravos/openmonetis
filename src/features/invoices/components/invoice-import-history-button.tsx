import { RiHistoryLine } from "@remixicon/react";
import Link from "next/link";
import { buildInvoiceImportHistoryHref } from "@/features/transactions/lib/import-continue-href";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";

type InvoiceImportHistoryButtonProps = {
	cardId: string;
	invoicePeriod: string;
	className?: string;
};

export function InvoiceImportHistoryButton({
	cardId,
	invoicePeriod,
	className,
}: InvoiceImportHistoryButtonProps) {
	return (
		<Button
			asChild
			type="button"
			size="sm"
			variant="outline"
			className={cn(
				"h-auto min-h-8 w-full min-w-0 px-2 py-1.5 text-[11px] leading-tight sm:text-xs",
				className,
			)}
		>
			<Link
				href={buildInvoiceImportHistoryHref(cardId, invoicePeriod)}
				className="inline-flex items-center justify-center gap-1 text-center"
			>
				<RiHistoryLine className="size-3.5 shrink-0" aria-hidden />
				Histórico
			</Link>
		</Button>
	);
}
