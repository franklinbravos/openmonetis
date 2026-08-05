"use client";

import { RiDownloadLine, RiHistoryLine, RiPlayLine } from "@remixicon/react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { getImportBatchDownloadUrlAction } from "@/features/transactions/actions/import-batch-history-action";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { isImportBatchDraft, isImportBatchImported } from "@/features/transactions/lib/import-batch-status";
import { buildImportContinueHref } from "@/features/transactions/lib/import-continue-href";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { formatDateTime } from "@/shared/utils/date";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type ImportFileHistoryProps = {
	entries: ImportFileHistoryEntry[];
	title?: string;
	description?: string;
	className?: string;
	compact?: boolean;
	showHeader?: boolean;
	emptyMessage?: string;
	limit?: number;
	viewAllHref?: string;
	viewAllLabel?: string;
	onContinueImport?: (entry: ImportFileHistoryEntry) => void;
	resumingBatchId?: string | null;
};

function formatFileSize(bytes: number | null): string | null {
	if (!bytes || bytes <= 0) return null;
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportFileHistoryBadges({ entry }: { entry: ImportFileHistoryEntry }) {
	return (
		<>
			{isImportBatchDraft(entry.status) ? (
				<Badge variant="secondary" className="text-[10px]">
					Rascunho salvo
				</Badge>
			) : !isImportBatchImported(entry.status) ? (
				<Badge variant="outline" className="text-[10px]">
					Apenas upload
				</Badge>
			) : null}
			{entry.hasAttachment ? (
				<Badge variant="secondary" className="text-[10px]">
					Arquivo salvo
				</Badge>
			) : null}
		</>
	);
}

function ImportFileHistoryContextLine({ entry }: { entry: ImportFileHistoryEntry }) {
	return (
		<>
			{formatDateTime(entry.createdAt)}
			{entry.cardName && entry.invoicePeriod
				? ` · ${entry.cardName} · ${displayPeriod(entry.invoicePeriod)}`
				: null}
			{formatFileSize(entry.sourceFileSize)
				? ` · ${formatFileSize(entry.sourceFileSize)}`
				: null}
		</>
	);
}

function ImportFileHistoryStatusText({ entry }: { entry: ImportFileHistoryEntry }) {
	if (isImportBatchImported(entry.status)) {
		return (
			<>
				{entry.importedCount} importado{entry.importedCount !== 1 ? "s" : ""}
				{entry.skippedCount > 0
					? ` · ${entry.skippedCount} ignorado${entry.skippedCount !== 1 ? "s" : ""}`
					: null}
			</>
		);
	}

	return isImportBatchDraft(entry.status)
		? "Importação salva — continue depois"
		: "Importação não concluída";
}

function ImportFileHistoryActions({
	entry,
	layout = "column",
	onContinueImport,
	resumingBatchId = null,
}: {
	entry: ImportFileHistoryEntry;
	layout?: "column" | "row";
	onContinueImport?: (entry: ImportFileHistoryEntry) => void;
	resumingBatchId?: string | null;
}) {
	const [isPending, startTransition] = useTransition();
	const continueLabel = isImportBatchDraft(entry.status)
		? "Continuar"
		: "Reprocessar";
	const isResumingThisEntry = resumingBatchId === entry.id;
	const isResumingOtherEntry =
		resumingBatchId != null && resumingBatchId !== entry.id;

	return (
		<div
			className={cn(
				"flex shrink-0 items-center gap-1",
				layout === "column" ? "flex-col items-end" : "justify-end",
			)}
		>
			{!isImportBatchImported(entry.status) ? (
				onContinueImport ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 border-primary/25 px-2.5 text-xs text-foreground hover:bg-primary/5 hover:text-foreground"
						disabled={isResumingThisEntry || isResumingOtherEntry}
						onClick={() => onContinueImport(entry)}
					>
						<RiPlayLine className="size-3.5" aria-hidden />
						{isResumingThisEntry ? "Carregando…" : continueLabel}
					</Button>
				) : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 border-primary/25 px-2.5 text-xs text-foreground hover:bg-primary/5 hover:text-foreground"
						asChild
					>
						<Link href={buildImportContinueHref(entry)}>
							<RiPlayLine className="size-3.5" aria-hidden />
							{continueLabel}
						</Link>
					</Button>
				)
			) : null}
			{entry.hasAttachment ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8 shrink-0"
					disabled={isPending}
					aria-label={`Baixar ${entry.sourceFileName}`}
					onClick={() => {
						startTransition(async () => {
							const result = await getImportBatchDownloadUrlAction({
								batchId: entry.id,
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
				</Button>
			) : null}
		</div>
	);
}

function ImportFileHistoryCardRow({
	entry,
	onContinueImport,
	resumingBatchId,
}: {
	entry: ImportFileHistoryEntry;
	onContinueImport?: (entry: ImportFileHistoryEntry) => void;
	resumingBatchId?: string | null;
}) {
	return (
		<div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 md:hidden">
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-medium text-sm" title={entry.sourceFileName}>
						{entry.sourceFileName}
					</p>
					<ImportFileHistoryBadges entry={entry} />
				</div>
				<p className="text-muted-foreground text-xs">
					<ImportFileHistoryContextLine entry={entry} />
				</p>
				<p className="text-muted-foreground text-xs">
					{isImportBatchImported(entry.status) ? (
						<ImportFileHistoryStatusText entry={entry} />
					) : isImportBatchDraft(entry.status) ? (
						"Importação salva — continue depois"
					) : (
						"Arquivo enviado — importação não concluída"
					)}
				</p>
			</div>
			<ImportFileHistoryActions
				entry={entry}
				layout="column"
				onContinueImport={onContinueImport}
				resumingBatchId={resumingBatchId}
			/>
		</div>
	);
}

function ImportFileHistoryTableRow({
	entry,
	onContinueImport,
	resumingBatchId,
}: {
	entry: ImportFileHistoryEntry;
	onContinueImport?: (entry: ImportFileHistoryEntry) => void;
	resumingBatchId?: string | null;
}) {
	return (
		<TableRow>
			<TableCell className="max-w-[280px]">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<p className="truncate font-medium text-sm" title={entry.sourceFileName}>
						{entry.sourceFileName}
					</p>
					<ImportFileHistoryBadges entry={entry} />
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground text-xs whitespace-nowrap">
				<ImportFileHistoryContextLine entry={entry} />
			</TableCell>
			<TableCell className="text-muted-foreground text-xs">
				<ImportFileHistoryStatusText entry={entry} />
			</TableCell>
			<TableCell className="text-right">
				<ImportFileHistoryActions
					entry={entry}
					layout="row"
					onContinueImport={onContinueImport}
					resumingBatchId={resumingBatchId}
				/>
			</TableCell>
		</TableRow>
	);
}

export function ImportFileHistory({
	entries,
	title = "Histórico de importações",
	description = "Arquivos já processados neste contexto. Evite reenviar o mesmo arquivo sem necessidade.",
	className,
	compact = false,
	showHeader = true,
	emptyMessage,
	limit,
	viewAllHref,
	viewAllLabel = "Ver todas as importações",
	onContinueImport,
	resumingBatchId = null,
}: ImportFileHistoryProps) {
	if (entries.length === 0) {
		if (!emptyMessage) return null;

		return (
			<p className={cn("text-muted-foreground text-sm", className)}>{emptyMessage}</p>
		);
	}

	const visibleEntries =
		limit != null && limit > 0 ? entries.slice(0, limit) : entries;
	const showViewAllLink = Boolean(viewAllHref && entries.length > 0);

	return (
		<section className={cn("space-y-3", className)}>
			{showHeader ? (
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<RiHistoryLine className="size-4 text-muted-foreground" aria-hidden />
						<h3 className="font-medium text-sm">{title}</h3>
					</div>
					{!compact ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							{description}
						</p>
					) : null}
				</div>
			) : null}

			<div className="space-y-2 md:hidden">
				{visibleEntries.map((entry) => (
					<ImportFileHistoryCardRow
						key={entry.id}
						entry={entry}
						onContinueImport={onContinueImport}
						resumingBatchId={resumingBatchId}
					/>
				))}
			</div>

			<div className="hidden rounded-lg border md:block">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Arquivo</TableHead>
							<TableHead>Enviado em</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">Ações</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleEntries.map((entry) => (
							<ImportFileHistoryTableRow
								key={entry.id}
								entry={entry}
								onContinueImport={onContinueImport}
								resumingBatchId={resumingBatchId}
							/>
						))}
					</TableBody>
				</Table>
			</div>

			{showViewAllLink ? (
				<p className="text-muted-foreground text-xs">
					<Link
						href={viewAllHref ?? "/transactions/import/history"}
						className="underline-offset-2 hover:text-foreground hover:underline"
					>
						{viewAllLabel}
					</Link>
					{limit != null && limit > 0 && entries.length > limit
						? ` · exibindo ${limit} de ${entries.length}`
						: entries.length > 0
							? ` · ${entries.length} registro${entries.length !== 1 ? "s" : ""}`
							: null}
				</p>
			) : limit != null && limit > 0 && entries.length > limit ? (
				<p className="text-muted-foreground text-xs">
					Exibindo {limit} de {entries.length} registros.
				</p>
			) : null}
		</section>
	);
}
