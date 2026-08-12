import { RiSparkling2Line } from "@remixicon/react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
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
	summary?: {
		categoriesSuggested: number;
		duplicatesFound: number;
		rowsAnalyzed: number;
	} | null;
};

export function ImportAiAnalysisBanner({
	status,
	errorMessage,
	summary,
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
				<AlertDescription className="text-sm">
					{errorMessage ??
						"Não foi possível concluir a análise com IA. A revisão segue com as regras automáticas."}
				</AlertDescription>
			</Alert>
		);
	}

	if (!summary) return null;

	return (
		<Alert className="border-emerald-500/20 bg-emerald-500/5">
			<AlertDescription className="text-sm">
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
			</AlertDescription>
		</Alert>
	);
}
