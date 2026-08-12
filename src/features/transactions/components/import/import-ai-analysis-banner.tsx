import { RiRefreshLine, RiSparkling2Line } from "@remixicon/react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";

export type ImportAiAnalysisStatus =
	| "idle"
	| "running"
	| "done"
	| "skipped"
	| "error";

type ImportAiAnalysisBannerProps = {
	status: ImportAiAnalysisStatus;
	errorMessage?: string | null;
	errorLog?: string | null;
	summary?: {
		categoriesSuggested: number;
		duplicatesFound: number;
		rowsAnalyzed: number;
	} | null;
	onRetry?: () => void;
	isRetrying?: boolean;
};

export function ImportAiAnalysisBanner({
	status,
	errorMessage,
	errorLog,
	summary,
	onRetry,
	isRetrying = false,
}: ImportAiAnalysisBannerProps) {
	if (status === "idle" || status === "skipped") return null;

	if (status === "running") {
		return (
			<Alert className="border-primary/20 bg-primary/5">
				<Spinner className="size-4" />
				<AlertDescription className="flex items-center gap-2 text-sm">
					<RiSparkling2Line className="size-4 shrink-0 text-primary" />
					<span>
						IA analisando duplicatas e categorias… isso roda em segundo plano
						enquanto você revisa.
					</span>
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
		<Alert className="border-emerald-500/20 bg-emerald-500/5">
			<AlertDescription className="flex flex-col gap-3 text-sm sm:flex-row sm:items-start sm:justify-between">
				<div>
					<span className="inline-flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
						<RiSparkling2Line className="size-4" />
						Análise com IA concluída
					</span>
					<span className="mt-1 block text-emerald-900/90 dark:text-emerald-100/90">
						{summary.duplicatesFound > 0
							? `${summary.duplicatesFound} duplicata(s) identificada(s)`
							: "Nenhuma duplicata extra encontrada"}
						{" · "}
						{summary.categoriesSuggested > 0
							? `${summary.categoriesSuggested} categoria(s) sugerida(s)`
							: "categorias inalteradas"}
						{" · "}
						{summary.rowsAnalyzed} linha(s) analisada(s)
					</span>
				</div>
				{onRetry ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="shrink-0 border-emerald-500/30 bg-background/80 text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-200"
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
