"use client";

import { RiDownloadLine } from "@remixicon/react";
import { useTransition } from "react";
import { toast } from "sonner";
import { getImportSourceDownloadUrlAction } from "@/features/transactions/actions/import-source-action";
import { Button } from "@/shared/components/ui/button";

type InvoiceImportSourceButtonProps = {
	cardId: string;
	invoicePeriod: string;
	fileName: string;
};

export function InvoiceImportSourceButton({
	cardId,
	invoicePeriod,
	fileName,
}: InvoiceImportSourceButtonProps) {
	const [isPending, startTransition] = useTransition();

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className="min-w-32"
			title={fileName}
			disabled={isPending}
			onClick={() => {
				startTransition(async () => {
					const result = await getImportSourceDownloadUrlAction({
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
			<RiDownloadLine className="size-4" aria-hidden />
			{isPending ? "Abrindo…" : "Arquivo importado"}
		</Button>
	);
}
