"use client";

import {
	RiCheckLine,
	RiCloseLine,
	RiDownloadLine,
	RiLoader4Line,
	RiUploadCloud2Line,
} from "@remixicon/react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deleteImportBatchClient,
	fetchCardImportPdfPasswordAttemptsClient,
	saveCardImportPdfPasswordClient,
} from "@/features/transactions/lib/import-api-client";
import { ImportDuplicateFileDialog } from "@/features/transactions/components/import/import-duplicate-file-dialog";
import { ImportPdfPasswordDialog } from "@/features/transactions/components/import/import-pdf-password-dialog";
import { isImportBatchImported } from "@/features/transactions/lib/import-batch-status";
import {
	findDuplicateImportFile,
	type ImportFileHistoryEntry,
} from "@/features/transactions/lib/import-file-duplicate";
import type { ImportUploadLogStatus } from "@/features/transactions/lib/parse-import-file-client";
import { parseImportFileClient } from "@/features/transactions/lib/parse-import-file-client";
import { CARD_IMPORT_PDF_PASSWORD_RULES } from "@/shared/lib/cards/import-pdf-password";
import { isSupportedImportFile } from "@/shared/lib/import/parse-import-file";
import {
	isPdfPasswordError,
	logPdfPasswordDebug,
	mapPdfLoadError,
	summarizePdfPasswordError,
} from "@/shared/lib/import/pdf-password";
import type { ImportStatement } from "@/shared/lib/import/types";
import { generateXlsTemplate } from "@/shared/lib/import/xls-parser";
import { formatBytes } from "@/shared/utils/number";
import { cn } from "@/shared/utils/ui";

type UploadLogEntry = {
	id: string;
	message: string;
	status: ImportUploadLogStatus;
};

type UploadParsedOptions = {
	existingBatchId?: string;
};

interface UploadZoneProps {
	/** Sinaliza o parse em andamento, para o modal de progresso da página. */
	onParsingChange?: (parsing: boolean) => void;
	onParsed: (
		statement: ImportStatement,
		file: File,
		options?: UploadParsedOptions,
	) => void;
	error?: string | null;
	onErrorClear?: () => void;
	linkedCardId?: string | null;
	autoPdfPasswordAttempts?: string[];
	importHistory?: ImportFileHistoryEntry[];
	resumeBatchId?: string | null;
	onDuplicateBatchCleared?: () => void;
}

const ACCEPTED_FORMATS = ".ofx,.qfx,.csv,.txt,.pdf,.xlsx,.xls";

const FORMAT_LABEL = ".ofx · .qfx · .csv · .txt · .pdf · .xlsx · .xls";

// Referência estável para o default da prop opcional — evita que o useEffect de
// sincronização dispare a cada render (novo array a cada render geraria loop).
const EMPTY_AUTO_PDF_PASSWORD_ATTEMPTS: string[] = [];

function UploadLogStatusIcon({ status }: { status: ImportUploadLogStatus }) {
	if (status === "pending") {
		return (
			<RiLoader4Line
				aria-hidden
				className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary"
			/>
		);
	}

	if (status === "success") {
		return (
			<RiCheckLine
				aria-hidden
				className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
			/>
		);
	}

	if (status === "error") {
		return (
			<RiCloseLine
				aria-hidden
				className="mt-0.5 size-3.5 shrink-0 text-destructive"
			/>
		);
	}

	return (
		<span
			aria-hidden
			className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
		/>
	);
}

export function UploadZone({
	onParsingChange,
	onParsed,
	error: externalError = null,
	onErrorClear,
	linkedCardId = null,
	autoPdfPasswordAttempts:
		initialAutoPdfPasswordAttempts = EMPTY_AUTO_PDF_PASSWORD_ATTEMPTS,
	importHistory = [],
	resumeBatchId = null,
	onDuplicateBatchCleared,
}: UploadZoneProps) {
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const [parsing, setParsing] = useState(false);
	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
	const [duplicateEntry, setDuplicateEntry] =
		useState<ImportFileHistoryEntry | null>(null);
	const [duplicatePendingFile, setDuplicatePendingFile] = useState<File | null>(
		null,
	);
	const [autoPdfPasswordAttempts, setAutoPdfPasswordAttempts] = useState(
		initialAutoPdfPasswordAttempts,
	);
	const [uploadLogs, setUploadLogs] = useState<UploadLogEntry[]>([]);
	const [activeFileName, setActiveFileName] = useState<string | null>(null);
	const [isSavingPassword, startSavePasswordTransition] = useTransition();
	const inputRef = useRef<HTMLInputElement>(null);
	const uploadLogIdRef = useRef(0);

	const appendUploadLog = useCallback(
		(message: string, status: ImportUploadLogStatus = "info") => {
			setUploadLogs((previous) => {
				if (status === "error") {
					let replacedPending = false;

					const withFailedPending = previous.map((entry) => {
						if (entry.status !== "pending" || replacedPending) {
							return entry;
						}

						replacedPending = true;
						return {
							...entry,
							status: "error" as const,
							message,
						};
					});

					if (replacedPending) {
						return withFailedPending;
					}
				}

				const finalized = previous.map((entry) =>
					entry.status === "pending"
						? { ...entry, status: "success" as const }
						: entry,
				);

				uploadLogIdRef.current += 1;

				return [
					...finalized,
					{
						id: `upload-log-${uploadLogIdRef.current}`,
						message,
						status,
					},
				];
			});
		},
		[],
	);

	const resetUploadLogs = useCallback(() => {
		uploadLogIdRef.current = 0;
		setUploadLogs([]);
		setActiveFileName(null);
	}, []);

	useEffect(() => {
		setAutoPdfPasswordAttempts(initialAutoPdfPasswordAttempts);
	}, [initialAutoPdfPasswordAttempts]);

	useEffect(() => {
		if (!linkedCardId) {
			setAutoPdfPasswordAttempts([]);
			return;
		}

		let cancelled = false;

		void fetchCardImportPdfPasswordAttemptsClient(linkedCardId)
			.then((result) => {
				if (cancelled) return;
				if (result.success) {
					setAutoPdfPasswordAttempts(result.attempts);
				}
			})
			.catch(() => {
				// Navegação/restart pode abortar a Server Action.
			});

		return () => {
			cancelled = true;
		};
	}, [linkedCardId]);

	const parseFile = async (
		file: File,
		options?: {
			explicitPassword?: string;
			savePasswordToCard?: boolean;
			savePasswordRule?:
				| typeof CARD_IMPORT_PDF_PASSWORD_RULES.fixed
				| typeof CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6
				| typeof CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6;
			existingBatchId?: string;
		},
	) => {
		setError(null);
		setPasswordError(null);
		onErrorClear?.();

		if (!isSupportedImportFile(file.name)) {
			resetUploadLogs();
			setActiveFileName(file.name);
			appendUploadLog(`Arquivo selecionado: ${file.name}`, "info");
			appendUploadLog(
				"Formato não suportado. Use .ofx, .qfx, .csv, .txt, .pdf, .xlsx ou .xls.",
				"error",
			);
			setError(
				"Formato não suportado. Use .ofx, .qfx, .csv, .txt, .pdf, .xlsx ou .xls.",
			);
			return;
		}

		resetUploadLogs();
		setActiveFileName(file.name);
		appendUploadLog(
			`Arquivo selecionado: ${file.name} (${formatBytes(file.size)})`,
			"info",
		);

		setParsing(true);

		try {
			logPdfPasswordDebug("upload:parse-start", {
				fileName: file.name,
				fileSize: file.size,
				explicitPassword: Boolean(options?.explicitPassword?.trim()),
				autoCandidateCount: autoPdfPasswordAttempts.length,
			});

			onParsingChange?.(true);
			const statement = await parseImportFileClient(file, {
				pdfPassword: options?.explicitPassword?.trim(),
				cardId: linkedCardId,
				pdfPasswordCandidates: options?.explicitPassword?.trim()
					? undefined
					: autoPdfPasswordAttempts.length > 0
						? autoPdfPasswordAttempts
						: undefined,
				onLog: appendUploadLog,
			});

			if (statement.transactions.length === 0) {
				appendUploadLog("Nenhuma transação encontrada no arquivo.", "error");
				setError("Nenhuma transação encontrada no arquivo.");
				return;
			}

			appendUploadLog("Importação pronta para revisão.", "success");

			if (
				options?.savePasswordToCard &&
				linkedCardId &&
				options.explicitPassword?.trim()
			) {
				startSavePasswordTransition(async () => {
					const result = await saveCardImportPdfPasswordClient(linkedCardId, {
						rule:
							options.savePasswordRule ?? CARD_IMPORT_PDF_PASSWORD_RULES.fixed,
						secret: options.explicitPassword?.trim() ?? "",
					});

					if (result.success) {
						toast.success(result.message);
						const refreshed =
							await fetchCardImportPdfPasswordAttemptsClient(linkedCardId);
						if (refreshed.success) {
							setAutoPdfPasswordAttempts(refreshed.attempts);
						}
					} else if (result.error) {
						toast.error(result.error);
					}
				});
			}

			setPasswordDialogOpen(false);
			setPendingFile(null);
			onParsed(statement, file, {
				existingBatchId: options?.existingBatchId,
			});
		} catch (err) {
			logPdfPasswordDebug("upload:parse-failed", {
				error: summarizePdfPasswordError(err),
			});

			const mappedError: Error = mapPdfLoadError(
				err,
				Boolean(
					options?.explicitPassword?.trim() ||
						autoPdfPasswordAttempts.length > 0,
				),
			);

			if (isPdfPasswordError(mappedError)) {
				appendUploadLog(mappedError.message, "error");
				setPendingFile(file);
				setPasswordDialogOpen(true);
				setPasswordError(
					options?.explicitPassword?.trim() &&
						mappedError.name === "PdfPasswordIncorrectError"
						? mappedError.message
						: null,
				);
				return;
			}

			if (options?.explicitPassword) {
				appendUploadLog(mappedError.message, "error");
				setPendingFile(file);
				setPasswordDialogOpen(true);
				setPasswordError(mappedError.message);
				return;
			}

			appendUploadLog(mappedError.message, "error");
			setError(mappedError.message);
		} finally {
			setParsing(false);
			onParsingChange?.(false);
		}
	};

	const handleFile = async (file: File) => {
		if (resumeBatchId) {
			await parseFile(file, { existingBatchId: resumeBatchId });
			return;
		}

		const duplicate = findDuplicateImportFile(file, importHistory);
		if (duplicate) {
			setDuplicateEntry(duplicate);
			setDuplicatePendingFile(file);
			setDuplicateDialogOpen(true);
			return;
		}

		await parseFile(file);
	};

	const handleConfirmDuplicateImport = async () => {
		if (!duplicatePendingFile || !duplicateEntry) return;
		const file = duplicatePendingFile;
		const existingBatchId = isImportBatchImported(duplicateEntry.status)
			? undefined
			: duplicateEntry.id;
		setDuplicateEntry(null);
		setDuplicatePendingFile(null);
		await parseFile(file, { existingBatchId });
	};

	const handleStartNewDuplicateImport = async () => {
		if (!duplicatePendingFile || !duplicateEntry) return;
		const file = duplicatePendingFile;
		const entry = duplicateEntry;
		setDuplicateEntry(null);
		setDuplicatePendingFile(null);

		if (!isImportBatchImported(entry.status)) {
			const result = await deleteImportBatchClient(entry.id);
			if (!result.success) {
				toast.error(
					result.error ?? "Não foi possível remover a importação anterior.",
				);
				return;
			}
			onDuplicateBatchCleared?.();
		}

		await parseFile(file);
	};

	const handlePasswordSubmit = async (
		password: string,
		options?: {
			saveToCard?: boolean;
			saveRule?:
				| typeof CARD_IMPORT_PDF_PASSWORD_RULES.fixed
				| typeof CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6
				| typeof CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6;
		},
	) => {
		if (!pendingFile) return;
		await parseFile(pendingFile, {
			explicitPassword: password,
			savePasswordToCard: options?.saveToCard,
			savePasswordRule: options?.saveRule,
		});
	};

	const handlePasswordDialogOpenChange = (open: boolean) => {
		setPasswordDialogOpen(open);
		if (!open) {
			setPendingFile(null);
			setPasswordError(null);
		}
	};

	const handleDownloadTemplate = async () => {
		const bytes = await generateXlsTemplate();
		const blob = new Blob([bytes], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "modelo-lancamentos.xlsx";
		a.click();
		URL.revokeObjectURL(url);
	};

	const displayError = externalError ?? error;
	const isBusy = parsing || isSavingPassword;
	const showUploadLog = uploadLogs.length > 0;

	return (
		<div className="flex flex-col gap-2 md:gap-3">
			<button
				type="button"
				disabled={isBusy}
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					const file = e.dataTransfer.files[0];
					if (file) void handleFile(file);
				}}
				className={cn(
					"flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition-colors md:gap-4",
					showUploadLog ? "md:p-8" : "md:p-16",
					dragging
						? "border-primary bg-primary/5"
						: "border-border hover:border-primary/50 hover:bg-muted/50",
					isBusy && "pointer-events-none opacity-60",
				)}
			>
				<RiUploadCloud2Line
					className={cn(
						"text-muted-foreground",
						showUploadLog ? "size-8 md:size-10" : "size-10 md:size-14",
					)}
				/>
				<div className="w-full text-center">
					<p className="font-medium text-sm">
						{isBusy
							? "Processando arquivo..."
							: showUploadLog
								? "Último upload"
								: "Arraste um arquivo aqui ou clique para selecionar"}
					</p>
					{!showUploadLog ? (
						<p className="mt-1 text-muted-foreground text-xs">{FORMAT_LABEL}</p>
					) : null}
				</div>

				{showUploadLog ? (
					<div className="mt-1 w-full max-w-lg border-border/70 border-t pt-3 text-left">
						{activeFileName ? (
							<p className="mb-2 truncate font-medium text-foreground text-xs">
								{activeFileName}
							</p>
						) : null}
						<ul
							className="flex max-h-36 flex-col gap-1.5 overflow-y-auto"
							aria-live="polite"
							aria-relevant="additions text"
						>
							{uploadLogs.map((entry) => (
								<li
									key={entry.id}
									className="flex items-start gap-2 text-xs leading-relaxed"
								>
									<UploadLogStatusIcon status={entry.status} />
									<span
										className={cn(
											"text-muted-foreground",
											entry.status === "error" && "text-destructive",
											entry.status === "success" && "text-foreground",
										)}
									>
										{entry.message}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
			</button>

			<input
				ref={inputRef}
				type="file"
				accept={ACCEPTED_FORMATS}
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void handleFile(file);
					e.target.value = "";
				}}
			/>

			<div className="flex items-start justify-between gap-3">
				{displayError ? (
					<p className="text-destructive text-sm">{displayError}</p>
				) : null}
				<button
					type="button"
					onClick={handleDownloadTemplate}
					className={cn(
						"flex items-center gap-1.5 text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline",
						!displayError && "ml-auto",
					)}
				>
					<RiDownloadLine className="size-3.5" />
					Baixar modelo .xlsx
				</button>
			</div>

			<ImportPdfPasswordDialog
				open={passwordDialogOpen}
				fileName={pendingFile?.name ?? null}
				error={passwordError}
				isPending={isBusy}
				linkedCardId={linkedCardId}
				onOpenChange={handlePasswordDialogOpenChange}
				onSubmit={(password, options) => {
					void handlePasswordSubmit(password, options);
				}}
			/>

			{duplicateEntry && duplicatePendingFile ? (
				<ImportDuplicateFileDialog
					open={duplicateDialogOpen}
					onOpenChange={(open) => {
						setDuplicateDialogOpen(open);
						if (!open) {
							setDuplicateEntry(null);
							setDuplicatePendingFile(null);
						}
					}}
					fileName={duplicatePendingFile.name}
					previousImport={duplicateEntry}
					onConfirmContinue={() => {
						void handleConfirmDuplicateImport();
					}}
					onConfirmNewImport={
						isImportBatchImported(duplicateEntry.status)
							? undefined
							: () => {
									void handleStartNewDuplicateImport();
								}
					}
				/>
			) : null}
		</div>
	);
}
