"use client";

import type { ReconciliationLine } from "@/db/schema";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

type SessionPreviewProps = {
	lines: ReconciliationLine[];
	statementTotal: number;
	sourceFileName: string;
};

export function SessionPreview({
	lines,
	statementTotal,
	sourceFileName,
}: SessionPreviewProps) {
	const previewLines = lines.slice(0, 8);

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
				<p className="text-muted-foreground">
					Arquivo{" "}
					<span className="font-medium text-foreground">{sourceFileName}</span>{" "}
					· {lines.length} linhas
				</p>
				<p className="font-medium">
					Total do extrato: {formatCurrency(statementTotal)}
				</p>
			</div>

			<div className="overflow-hidden rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Data</TableHead>
							<TableHead>Descrição</TableHead>
							<TableHead className="text-right">Valor</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{previewLines.map((line) => (
							<TableRow key={line.id}>
								<TableCell className="whitespace-nowrap">
									{formatDateOnly(line.purchaseDate)}
								</TableCell>
								<TableCell className="max-w-[320px] truncate">
									{line.description}
								</TableCell>
								<TableCell className="text-right font-mono">
									{formatCurrency(Number(line.amount))}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{lines.length > previewLines.length ? (
				<p className="text-muted-foreground text-xs">
					Mostrando {previewLines.length} de {lines.length} linhas. A análise
					automática será adicionada na próxima fase.
				</p>
			) : null}
		</div>
	);
}
