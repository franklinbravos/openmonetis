"use client";

import { RiAddFill } from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";

/*
 * Cabeçalho de campo do diálogo de lançamento. O `min-h-7` acompanha a altura
 * do botão de ação: sem ele, um campo com botão ("Conta", "Categoria") fica
 * mais alto que o vizinho sem botão ("Forma de pagamento", "Tipo de transação")
 * e os dois selects da linha saem desalinhados.
 */
export function SelectFieldHeader({
	htmlFor,
	label,
	actionLabel,
	onAction,
}: {
	htmlFor: string;
	label: string;
	actionLabel?: string;
	onAction?: () => void;
}) {
	return (
		<div className="flex min-h-7 items-center justify-between gap-2">
			<Label htmlFor={htmlFor}>{label}</Label>
			{onAction ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
					aria-label={actionLabel}
					onClick={onAction}
				>
					<RiAddFill className="size-4" />
				</Button>
			) : null}
		</div>
	);
}
