import { RiUploadCloud2Line } from "@remixicon/react";
import Link from "next/link";
import { ImportFileHistory } from "@/features/transactions/components/import/import-file-history";
import { ImportHistoryFilters } from "@/features/transactions/components/import/import-history-filters";
import type { SelectOption } from "@/features/transactions/components/types";
import { buildImportLandingHref } from "@/features/transactions/lib/import-continue-href";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";

type ImportHistoryPageProps = {
	entries: ImportFileHistoryEntry[];
	cardOptions: SelectOption[];
	cardId: string | null;
	accountId?: string | null;
	invoicePeriod: string | null;
	backHref?: string;
	backLabel?: string;
	cardTitle?: string;
	cardDescription?: string;
	emptyMessage?: string;
};

export function ImportHistoryPage({
	entries,
	cardOptions,
	cardId,
	accountId = null,
	invoicePeriod,
	backHref = "/transactions/import",
	backLabel = "Voltar para importação",
	cardTitle = "Histórico de importações",
	cardDescription = "Todos os arquivos já processados. Use esta lista para evitar reenviar o mesmo extrato ou fatura.",
	emptyMessage = "Nenhum arquivo importado registrado ainda.",
}: ImportHistoryPageProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{cardTitle}</CardTitle>
				<CardDescription>{cardDescription}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<ImportHistoryFilters
					cardOptions={cardOptions}
					cardId={cardId}
					invoicePeriod={invoicePeriod}
				/>
				<ImportFileHistory
					entries={entries}
					showHeader={false}
					emptyMessage={emptyMessage}
					allowDelete
				/>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Button asChild>
						<Link
							href={buildImportLandingHref({
								cardId,
								accountId,
								invoicePeriod,
							})}
						>
							<RiUploadCloud2Line className="size-4" aria-hidden />
							Nova importação
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href={backHref}>{backLabel}</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
