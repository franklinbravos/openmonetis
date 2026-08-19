"use client";

import {
	RiDeleteBinLine,
	RiDownloadLine,
	RiHistoryLine,
	RiPlayLine,
} from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	cloneImportBatchForReprocessAction,
	deleteImportBatchAction,
	getImportBatchDownloadUrlAction,
} from "@/features/transactions/actions/import-batch-history-action";
import {
	canDeleteImportBatch,
	isImportBatchDraft,
	isImportBatchImported,
} from "@/features/transactions/lib/import-batch-status";
import { buildImportResumeHref } from "@/features/transactions/lib/import-continue-href";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import {
	formatImportEntryContext,
	resolveImportEntryActionLabel,
} from "@/features/transactions/lib/import-file-history-entry";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
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
	resumingBatchId?: string | null;
	allowDelete?: boolean;
};

function formatFileSize(bytes: number | null): string | null {
	if (!bytes || bytes <= 0) return null;
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportFileHistoryBadges({ entry }: { entry: ImportFileHistoryEntry }) {
	if (isImportBatchImported(entry.status)) {
		return (
			<Badge variant="success" className="text-[10px]">
				Importado
			</Badge>
		);
	}

	return (
		<>
			{isImportBatchDraft(entry.status) ? (
				<Badge variant="secondary" className="text-[10px]">
					Rascunho salvo
				</Badge>
			) : (
				<Badge variant="outline" className="text-[10px]">
					Apenas upload
				</Badge>
			)}
			{entry.hasAttachment ? (
				<Badge variant="secondary" className="text-[10px]">
					Arquivo salvo
				</Badge>
			) : null}
		</>
	);
}

function ImportFileHistoryContextLine({
	entry,
}: {
	entry: ImportFileHistoryEntry;
}) {
	const context = formatImportEntryContext(entry);
	const fileSize = formatFileSize(entry.sourceFileSize);

	return (
		<>
			{formatDateTime(entry.createdAt)}
			{context ? ` · ${context}` : null}
			{fileSize ? ` · ${fileSize}` : null}
		</>
	);
}

function ImportFileHistoryContextStack({
	entry,
}: {
	entry: ImportFileHistoryEntry;
}) {
	const context = formatImportEntryContext(entry);
	const fileSize = formatFileSize(entry.sourceFileSize);

	return (
		<div className="space-y-0.5">
			<p>{formatDateTime(entry.createdAt)}</p>
			{context ? <p className="break-words">{context}</p> : null}
			{fileSize ? <p>{fileSize}</p> : null}
		</div>
	);
}

function ImportFileHistoryStatusText({
	entry,
}: {
	entry: ImportFileHistoryEntry;
}) {
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
		: entry.hasAttachment
			? "Arquivo enviado — importação não concluída"
			: "Registro criado — arquivo não salvo no servidor";
}

function ImportFileHistoryActions({
	entry,
	layout = "column",
	resumingBatchId = null,
	allowDelete = false,
	onRequestDelete,
}: {
	entry: ImportFileHistoryEntry;
	layout?: "column" | "row";
	resumingBatchId?: string | null;
	allowDelete?: boolean;
	onRequestDelete?: (entry: ImportFileHistoryEntry) => void;
}) {
	const [isPending, startTransition] = useTransition();
	const [isCloning, startCloning] = useTransition();
	const primaryActionLabel = resolveImportEntryActionLabel(entry);
	const isResumingThisEntry = resumingBatchId === entry.id;
	const isResumingOtherEntry =
		resumingBatchId != null && resumingBatchId !== entry.id;
	const canResumeOrReprocess = !isImportBatchImported(entry.status);
	// Já importado não tem rascunho para retomar — reprocessar clona o lote no
	// servidor (nunca toca no original) e abre uma revisão nova a partir dele,
	// pelo mesmo fluxo `?lote=<id>` que a retomada normal já usa.
	const canReprocessImported =
		isImportBatchImported(entry.status) && entry.hasAttachment;
	const canDelete = allowDelete && canDeleteImportBatch(entry.status);

	const handleReprocessImported = () => {
		startCloning(async () => {
			const result = await cloneImportBatchForReprocessAction({
				batchId: entry.id,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			window.location.assign(
				buildImportResumeHref({ ...entry, id: result.importBatchId }),
			);
		});
	};

	return (
		<div
			className={cn(
				"flex shrink-0 items-center gap-1",
				layout === "column" ? "flex-col items-end" : "justify-end",
			)}
		>
			{canResumeOrReprocess ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 border-primary/25 px-2.5 text-xs text-foreground hover:bg-primary/5 hover:text-foreground"
					disabled={isResumingThisEntry || isResumingOtherEntry}
					onClick={() => {
						window.location.assign(buildImportResumeHref(entry));
					}}
				>
					<RiPlayLine className="size-3.5" aria-hidden />
					{isResumingThisEntry ? "Carregando…" : primaryActionLabel}
				</Button>
			) : null}
			{canReprocessImported ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 border-primary/25 px-2.5 text-xs text-foreground hover:bg-primary/5 hover:text-foreground"
					disabled={isCloning}
					onClick={handleReprocessImported}
				>
					<RiPlayLine className="size-3.5" aria-hidden />
					{isCloning ? "Carregando…" : "Reprocessar"}
				</Button>
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
			{canDelete ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
					aria-label={`Excluir ${entry.sourceFileName}`}
					onClick={() => onRequestDelete?.(entry)}
				>
					<RiDeleteBinLine className="size-4" aria-hidden />
				</Button>
			) : null}
		</div>
	);
}

function ImportFileHistoryCardRow({
	entry,
	resumingBatchId,
	allowDelete,
	onRequestDelete,
}: {
	entry: ImportFileHistoryEntry;
	resumingBatchId?: string | null;
	allowDelete?: boolean;
	onRequestDelete?: (entry: ImportFileHistoryEntry) => void;
}) {
	return (
		<div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 md:hidden">
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<p
						className="truncate font-medium text-sm"
						title={entry.sourceFileName}
					>
						{entry.sourceFileName}
					</p>
					<ImportFileHistoryBadges entry={entry} />
				</div>
				<p className="text-muted-foreground text-xs">
					<ImportFileHistoryContextLine entry={entry} />
				</p>
				<p className="text-muted-foreground text-xs">
					<ImportFileHistoryStatusText entry={entry} />
				</p>
			</div>
			<ImportFileHistoryActions
				entry={entry}
				layout="column"
				resumingBatchId={resumingBatchId}
				allowDelete={allowDelete}
				onRequestDelete={onRequestDelete}
			/>
		</div>
	);
}

function ImportFileHistoryTableRow({
	entry,
	resumingBatchId,
	allowDelete,
	onRequestDelete,
}: {
	entry: ImportFileHistoryEntry;
	resumingBatchId?: string | null;
	allowDelete?: boolean;
	onRequestDelete?: (entry: ImportFileHistoryEntry) => void;
}) {
	return (
		<TableRow>
			<TableCell className="align-top whitespace-normal">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<p
						className="min-w-0 break-words font-medium text-sm"
						title={entry.sourceFileName}
					>
						{entry.sourceFileName}
					</p>
					<ImportFileHistoryBadges entry={entry} />
				</div>
			</TableCell>
			<TableCell className="align-top text-muted-foreground text-xs whitespace-normal">
				<ImportFileHistoryContextStack entry={entry} />
			</TableCell>
			<TableCell className="align-top break-words text-muted-foreground text-xs whitespace-normal">
				<ImportFileHistoryStatusText entry={entry} />
			</TableCell>
			<TableCell className="align-top text-right whitespace-normal">
				<ImportFileHistoryActions
					entry={entry}
					layout="row"
					resumingBatchId={resumingBatchId}
					allowDelete={allowDelete}
					onRequestDelete={onRequestDelete}
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
	resumingBatchId = null,
	allowDelete = false,
}: ImportFileHistoryProps) {
	const router = useRouter();
	const [pendingDeleteEntry, setPendingDeleteEntry] =
		useState<ImportFileHistoryEntry | null>(null);

	const handleConfirmDelete = async () => {
		if (!pendingDeleteEntry) return;

		const result = await deleteImportBatchAction({
			batchId: pendingDeleteEntry.id,
		});

		if (!result.success) {
			toast.error(result.error ?? "Não foi possível excluir a importação.");
			throw new Error(result.error ?? "delete failed");
		}

		toast.success(result.message ?? "Importação excluída.");
		setPendingDeleteEntry(null);
		router.refresh();
	};

	if (entries.length === 0) {
		if (!emptyMessage) return null;

		return (
			<p className={cn("text-muted-foreground text-sm", className)}>
				{emptyMessage}
			</p>
		);
	}

	const visibleEntries =
		limit != null && limit > 0 ? entries.slice(0, limit) : entries;
	const showViewAllLink = Boolean(viewAllHref && entries.length > 0);

	return (
		<>
			<section className={cn("space-y-3", className)}>
				{showHeader ? (
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<RiHistoryLine
								className="size-4 text-muted-foreground"
								aria-hidden
							/>
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
							resumingBatchId={resumingBatchId}
							allowDelete={allowDelete}
							onRequestDelete={setPendingDeleteEntry}
						/>
					))}
				</div>

				<div className="hidden rounded-lg border md:block">
					<Table className="table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-[30%]">Arquivo</TableHead>
								<TableHead className="w-[18%]">Enviado em</TableHead>
								<TableHead className="w-[22%]">Status</TableHead>
								<TableHead className="w-[30%] text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleEntries.map((entry) => (
								<ImportFileHistoryTableRow
									key={entry.id}
									entry={entry}
									resumingBatchId={resumingBatchId}
									allowDelete={allowDelete}
									onRequestDelete={setPendingDeleteEntry}
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

			<ConfirmActionDialog
				open={pendingDeleteEntry != null}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteEntry(null);
				}}
				title="Excluir importação?"
				description={
					pendingDeleteEntry
						? `O registro de "${pendingDeleteEntry.sourceFileName}" será removido. Esta ação não pode ser desfeita.`
						: undefined
				}
				confirmLabel="Excluir"
				confirmVariant="destructive"
				pendingLabel="Excluindo…"
				onConfirm={handleConfirmDelete}
			/>
		</>
	);
}
