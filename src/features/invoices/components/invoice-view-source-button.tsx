"use client";

import { RiEyeLine } from "@remixicon/react";
import { useTransition } from "react";
import { toast } from "sonner";
import { getImportSourceDownloadUrlClient } from "@/features/transactions/lib/import-api-client";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/ui";

type InvoiceViewSourceButtonProps = {
	cardId: string;
	invoicePeriod: string;
	className?: string;
};

export function InvoiceViewSourceButton({
	cardId,
	invoicePeriod,
	className,
}: InvoiceViewSourceButtonProps) {
	const [isPending, startTransition] = useTransition();

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			disabled={isPending}
			className={cn(
				"h-auto min-h-8 w-full min-w-0 px-2 py-1.5 text-[11px] leading-tight sm:text-xs",
				className,
			)}
			onClick={() => {
				startTransition(async () => {
					const result = await getImportSourceDownloadUrlClient({
						cardId,
						invoicePeriod,
					});

					if (!result.success) {
						toast.error(result.error);
						return;
					}

					window.open(result.url, "_blank", "noopener,noreferrer");
				});
			}}
		>
			<RiEyeLine className="size-3.5 shrink-0" aria-hidden />
			{isPending ? "Abrindo…" : "Visualizar fatura"}
		</Button>
	);
}
