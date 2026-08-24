"use client";

import { RiAlertLine, RiCheckboxCircleLine } from "@remixicon/react";
import { ImportSourceFileLink } from "@/features/transactions/components/import/import-source-file-link";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { invoiceSourceTotalKindLabel } from "@/shared/lib/import/invoice-source-total";
import {
	type ImportInvoiceReconciliation,
	SOURCE_ROUNDING_TOLERANCE,
} from "@/shared/lib/import/invoice-total";
import type { InvoiceSourceTotalKind } from "@/shared/lib/import/types";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

type InvoiceTotalReconciliationBannerProps = {
	reconciliation: ImportInvoiceReconciliation;
	sourceKind: InvoiceSourceTotalKind;
	confidence: "high" | "inferred";
	invoiceExtraCount?: number;
	invoiceExtraMarkedForRemovalCount?: number;
	crossPeriodCount?: number;
	crossPeriodDisplayTotal?: number;
	/** Arquivo em conferência, para abrir ao lado dos números. */
	sourceFile?: File | null;
};

function formatSignedDelta(delta: number): string {
	const prefix = delta > 0 ? "+" : delta < 0 ? "−" : "";
	return `${prefix}${formatCurrency(Math.abs(delta))}`;
}

function StatCard({
	label,
	value,
	emphasis = false,
	checked = false,
}: {
	label: string;
	value: string;
	emphasis?: boolean;
	/** Marca o card como conferido, dispensando frase de confirmação. */
	checked?: boolean;
}) {
	return (
		<div
			className={cn(
				"rounded-md border px-3 py-2",
				checked
					? "border-emerald-500/40 bg-emerald-500/10"
					: "border-border/60 bg-background/70",
			)}
		>
			<p className="text-muted-foreground text-xs">{label}</p>
			<p
				className={cn(
					"flex items-center gap-1.5 tabular-nums",
					emphasis ? "font-semibold" : "font-medium",
				)}
			>
				{checked ? (
					<RiCheckboxCircleLine
						className="size-4 shrink-0 text-emerald-600"
						aria-label="Confere com o arquivo"
					/>
				) : null}
				{value}
			</p>
		</div>
	);
}

export function InvoiceTotalReconciliationBanner({
	reconciliation,
	sourceKind,
	confidence,
	invoiceExtraCount = 0,
	invoiceExtraMarkedForRemovalCount = 0,
	crossPeriodCount = 0,
	crossPeriodDisplayTotal = 0,
	sourceFile = null,
}: InvoiceTotalReconciliationBannerProps) {
	// Até dois centavos é arredondamento de parcela do banco, não divergência.
	const isBalanced =
		Math.abs(reconciliation.delta) <= SOURCE_ROUNDING_TOLERANCE;
	const mismatchCount = reconciliation.amountMismatchRows.length;
	const pendingImportCount = reconciliation.pendingImportRows.length;
	const unselectedFileCount = reconciliation.missingFileRows.length;

	const statusParts: string[] = [];

	if (invoiceExtraCount > 0) {
		statusParts.push(
			`${invoiceExtraCount} fora do arquivo${
				invoiceExtraMarkedForRemovalCount > 0
					? ` (${invoiceExtraMarkedForRemovalCount} para remover)`
					: ""
			}`,
		);
	}

	if (crossPeriodCount > 0) {
		statusParts.push(
			`${crossPeriodCount} cadastrados em outro período (${formatCurrency(crossPeriodDisplayTotal)})`,
		);
	}

	if (pendingImportCount > 0) {
		statusParts.push(`${pendingImportCount} a importar`);
	}

	if (unselectedFileCount > 0) {
		statusParts.push(`${unselectedFileCount} do arquivo não selecionados`);
	}

	if (mismatchCount > 0) {
		statusParts.push(`${mismatchCount} com valor divergente`);
	}

	return (
		<Alert
			variant="default"
			className={cn(
				"border-border/60 bg-muted/15",
				isBalanced && "border-emerald-500/30 bg-emerald-500/5",
			)}
		>
			{isBalanced ? (
				<RiCheckboxCircleLine className="size-4 text-emerald-600" />
			) : (
				<RiAlertLine className="size-4 text-muted-foreground" />
			)}
			<AlertTitle className="flex flex-wrap items-center gap-2">
				Conferência do total da fatura
				<Badge variant="outline" className="font-normal text-xs">
					{invoiceSourceTotalKindLabel(sourceKind)}
				</Badge>
				{sourceFile ? <ImportSourceFileLink file={sourceFile} /> : null}
				{confidence === "inferred" ? (
					<Badge variant="secondary" className="font-normal text-xs">
						Inferido
					</Badge>
				) : null}
				{isBalanced ? (
					<Badge variant="success" className="font-normal text-xs">
						Conferido
					</Badge>
				) : null}
			</AlertTitle>
			<AlertDescription className="space-y-3 text-sm">
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						label="Total do arquivo"
						value={formatCurrency(reconciliation.sourceTotal)}
					/>
					<StatCard
						label="Já cadastrado"
						value={formatCurrency(reconciliation.existingDisplayTotal)}
					/>
					<StatCard
						label="Selecionado para importar"
						value={formatCurrency(reconciliation.selectedImportDisplayTotal)}
					/>
					<StatCard
						label="Total projetado"
						value={formatCurrency(reconciliation.projectedDisplayTotal)}
						emphasis
						checked={isBalanced}
					/>
				</div>

				<p
					className={cn(
						"text-xs tabular-nums",
						isBalanced
							? "text-emerald-700 dark:text-emerald-300"
							: "text-foreground",
					)}
				>
					Diferença em relação ao arquivo:{" "}
					<span
						className={cn("font-medium", !isBalanced && "text-destructive")}
					>
						{formatSignedDelta(reconciliation.delta)}
					</span>
				</p>

				{reconciliation.filePaymentsTotal > 0 ? (
					<p className="text-muted-foreground text-xs leading-relaxed">
						O arquivo declara {formatCurrency(reconciliation.filePaymentsTotal)}{" "}
						em pagamentos recebidos, então o total de{" "}
						{formatCurrency(reconciliation.sourceTotal)} é o saldo da fatura, já
						líquido do que foi pago. A conferência usa a soma das cobranças do
						arquivo, que é o total da fatura no OpenMonetis.
					</p>
				) : null}

				{statusParts.length > 0 ? (
					<p className="text-muted-foreground text-xs leading-relaxed">
						{statusParts.join(" · ")}.
					</p>
				) : null}

				{/* Conferido não precisa de frase: o check no card já diz. */}
				{isBalanced ? null : (
					<p className="text-muted-foreground text-xs leading-relaxed">
						{invoiceExtraCount > 0
							? "Revise a tabela abaixo: itens em vermelho serão removidos ao confirmar. Desmarque o que quiser manter."
							: crossPeriodCount > 0
								? `A diferença vem de ${crossPeriodCount} lançamento${crossPeriodCount !== 1 ? "s" : ""} já cadastrado${crossPeriodCount !== 1 ? "s" : ""} em outro período (${formatCurrency(crossPeriodDisplayTotal)}). Eles não entram no total desta fatura — confira o período desses lançamentos no cadastro.`
								: "Revise a tabela abaixo para categorizar, vincular duplicatas ou selecionar lançamentos do arquivo."}
					</p>
				)}
			</AlertDescription>
		</Alert>
	);
}
