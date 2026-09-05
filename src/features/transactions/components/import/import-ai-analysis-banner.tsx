"use client";

import { RiRefreshLine, RiSparkling2Line } from "@remixicon/react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Spinner } from "@/shared/components/ui/spinner";

export type ImportAiAnalysisStatus =
	| "idle"
	| "running"
	| "done"
	| "skipped"
	| "error";

export type ImportAiAnalysisProgress = {
	phase:
		| "preparing"
		| "categorizing"
		| "checking_duplicates"
		| "analyzing"
		| "applying";
	message: string;
	currentBatch?: number;
	totalBatches?: number;
	modelLabel?: string | null;
	rowsAnalyzed?: number;
	rowCount?: number;
	candidateCount?: number;
	categoriesApplied?: number;
	skippedByAlgorithm?: number;
	startedAt?: number;
};

type ImportAiAnalysisBannerProps = {
	status: ImportAiAnalysisStatus;
	progress?: ImportAiAnalysisProgress | null;
	errorMessage?: string | null;
	errorLog?: string | null;
	summary?: {
		categoriesSuggested: number;
		duplicatesFound: number;
		rowsAnalyzed: number;
		skippedByAlgorithm?: number;
	} | null;
	onRetry?: () => void;
	isRetrying?: boolean;
};

function formatElapsedSeconds(startedAt?: number): string | null {
	if (!startedAt) return null;
	const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
	if (elapsed < 60) return `${elapsed}s`;
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;
	return `${minutes}m ${seconds}s`;
}

export function ImportAiAnalysisBanner({
	status,
	progress,
	errorMessage,
	errorLog,
	summary,
	onRetry,
	isRetrying = false,
}: ImportAiAnalysisBannerProps) {
	const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);

	useEffect(() => {
		if (status !== "running" || !progress?.startedAt) {
			setElapsedLabel(null);
			return;
		}

		const updateElapsed = () => {
			setElapsedLabel(formatElapsedSeconds(progress.startedAt));
		};

		updateElapsed();
		const timer = window.setInterval(updateElapsed, 1000);
		return () => {
			window.clearInterval(timer);
		};
	}, [progress?.startedAt, status]);

	if (status === "idle" || status === "skipped") return null;

	if (status === "running") {
		const batchProgress =
			progress?.currentBatch && progress.totalBatches
				? Math.round((progress.currentBatch / progress.totalBatches) * 100)
				: progress?.phase === "preparing"
					? 8
					: progress?.phase === "applying"
						? 96
						: 12;

		return (
			<Alert className="border-primary/20 bg-primary/5">
				<Spinner className="size-4" />
				<AlertDescription className="flex flex-col gap-3 text-sm">
					<div className="flex items-start gap-2">
						<RiSparkling2Line className="mt-0.5 size-4 shrink-0 text-primary" />
						<div className="space-y-1">
							<p className="font-medium text-foreground">
								{progress?.message ?? "IA analisando duplicatas e categorias…"}
							</p>
							<p className="text-muted-foreground text-xs leading-relaxed">
								{progress?.modelLabel
									? `Modelo: ${progress.modelLabel}`
									: "Validando modelo configurado em Ajustes"}
								{progress?.categoriesApplied != null &&
								progress.categoriesApplied > 0
									? ` · ${progress.categoriesApplied} categoria(s) já aplicada(s)`
									: null}
								{progress?.rowCount != null
									? ` · ${progress.rowsAnalyzed ?? 0}/${progress.rowCount} linha(s)`
									: null}
								{progress?.skippedByAlgorithm
									? ` · ${progress.skippedByAlgorithm} já resolvida(s) pelo algoritmo`
									: null}
								{progress?.candidateCount != null &&
								progress.phase === "checking_duplicates"
									? ` · ${progress.candidateCount} candidato(s) a duplicata`
									: null}
								{elapsedLabel ? ` · ${elapsedLabel}` : null}
							</p>
						</div>
					</div>
					<div className="space-y-1.5 pl-6">
						<Progress value={batchProgress} className="h-1.5" />
						<p className="text-[11px] text-muted-foreground">
							{progress?.phase === "preparing"
								? "Preparando contexto e modelo"
								: progress?.phase === "categorizing"
									? progress.currentBatch && progress.totalBatches
										? `Categorizando · lote ${progress.currentBatch} de ${progress.totalBatches}`
										: "Categorizando lançamentos"
									: progress?.phase === "checking_duplicates"
										? progress.currentBatch && progress.totalBatches
											? `Duplicatas ambíguas · lote ${progress.currentBatch} de ${progress.totalBatches}`
											: "Verificando duplicatas ambíguas"
										: progress?.phase === "applying"
											? "Aplicando sugestões na revisão"
											: progress?.currentBatch && progress?.totalBatches
												? `Lote ${progress.currentBatch} de ${progress.totalBatches}`
												: "Consultando o modelo"}
						</p>
					</div>
				</AlertDescription>
			</Alert>
		);
	}

	if (status === "error") {
		return (
			<Alert variant="destructive">
				<AlertDescription className="flex flex-col gap-3 text-sm">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<span>
							{errorMessage ??
								"Não foi possível concluir a análise com IA. A revisão segue com as regras automáticas."}
						</span>
						{onRetry ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="shrink-0 border-destructive/30 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
								onClick={onRetry}
								disabled={isRetrying}
							>
								{isRetrying ? (
									<Spinner className="size-4" />
								) : (
									<RiRefreshLine className="size-4" />
								)}
								{isRetrying ? "Reprocessando…" : "Tentar novamente"}
							</Button>
						) : null}
					</div>
					{errorLog ? (
						<div className="space-y-1.5">
							<p className="font-medium text-destructive/90 text-xs uppercase tracking-wide">
								Log de erro
							</p>
							<pre className="max-h-56 overflow-auto rounded-md border border-destructive/20 bg-destructive/5 p-3 font-mono text-[11px] leading-relaxed text-destructive/95 whitespace-pre-wrap break-words">
								{errorLog}
							</pre>
						</div>
					) : null}
				</AlertDescription>
			</Alert>
		);
	}

	if (!summary) return null;

	return (
		<Alert className="border-positive/20 bg-positive-surface">
			<AlertDescription className="flex flex-col gap-3 text-sm sm:flex-row sm:items-start sm:justify-between">
				<div>
					<span className="inline-flex items-center gap-1.5 font-medium text-positive">
						<RiSparkling2Line className="size-4" />
						Análise com IA concluída
					</span>
					<span className="mt-1 block text-positive/90">
						{summary.duplicatesFound > 0
							? `${summary.duplicatesFound} duplicata(s) identificada(s)`
							: "Nenhuma duplicata extra encontrada"}
						{" · "}
						{summary.categoriesSuggested > 0
							? `${summary.categoriesSuggested} categoria(s) sugerida(s)`
							: "categorias inalteradas"}
						{" · "}
						{summary.rowsAnalyzed} linha(s) analisada(s)
						{summary.skippedByAlgorithm
							? ` · ${summary.skippedByAlgorithm} já resolvida(s) pelo algoritmo`
							: null}
					</span>
				</div>
				{onRetry ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="shrink-0 border-positive/30 bg-background/80 text-positive hover:bg-positive-surface"
						onClick={onRetry}
						disabled={isRetrying}
					>
						{isRetrying ? (
							<Spinner className="size-4" />
						) : (
							<RiRefreshLine className="size-4" />
						)}
						{isRetrying ? "Reprocessando…" : "Reprocessar"}
					</Button>
				) : null}
			</AlertDescription>
		</Alert>
	);
}
