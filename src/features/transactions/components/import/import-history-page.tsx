import Link from "next/link";
import { ImportFileHistory } from "@/features/transactions/components/import/import-file-history";
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
	backHref?: string;
};

export function ImportHistoryPage({
	entries,
	backHref = "/transactions/import",
}: ImportHistoryPageProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Histórico de importações</CardTitle>
				<CardDescription>
					Todos os arquivos já processados. Use esta lista para evitar reenviar o
					mesmo extrato ou fatura.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<ImportFileHistory
					entries={entries}
					showHeader={false}
					emptyMessage="Nenhum arquivo importado registrado ainda."
				/>
				<div>
					<Button variant="outline" asChild>
						<Link href={backHref}>Voltar para importação</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
