"use client";

import { RiCheckboxCircleLine, RiLoader4Line } from "@remixicon/react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/utils/ui";

/** Etapas do preparo de uma importação, na ordem em que acontecem. */
export const IMPORT_PROGRESS_STEPS = [
	{ id: "fetching", label: "Recuperando o arquivo" },
	{ id: "parsing", label: "Lendo os lançamentos" },
	{ id: "matching", label: "Conferindo com o que já está cadastrado" },
] as const;

export type ImportProgressStep = (typeof IMPORT_PROGRESS_STEPS)[number]["id"];

type ImportProgressDialogProps = {
	/** Etapa atual, ou `null` quando não há preparo em andamento. */
	step: ImportProgressStep | null;
};

/**
 * Progresso do preparo da importação.
 *
 * Recuperar o arquivo, parsear e conferir são três etapas assíncronas que
 * mexiam no mesmo estado da tela: o passo do fluxo avançava e voltava conforme
 * `statement` e `rows` iam sendo preenchidos, e a tela piscava. Cobrir a
 * transição com um modal resolve o efeito e, de quebra, diz o que está
 * acontecendo — que era invisível.
 */
/**
 * Tempo mínimo em tela.
 *
 * Preparo rápido fazia o modal aparecer e desaparecer num piscar — o mesmo
 * incômodo que ele existe para resolver. Meio segundo é curto para quem espera
 * e suficiente para não parecer defeito.
 */
const MIN_VISIBLE_MS = 500;

export function ImportProgressDialog({ step }: ImportProgressDialogProps) {
	const [visibleStep, setVisibleStep] = useState<ImportProgressStep | null>(
		step,
	);

	useEffect(() => {
		if (step) {
			setVisibleStep(step);
			return;
		}

		const timer = setTimeout(() => setVisibleStep(null), MIN_VISIBLE_MS);
		return () => clearTimeout(timer);
	}, [step]);

	const currentIndex = visibleStep
		? IMPORT_PROGRESS_STEPS.findIndex((entry) => entry.id === visibleStep)
		: -1;

	return (
		<Dialog open={visibleStep !== null}>
			<DialogContent
				className="sm:max-w-sm"
				showCloseButton={false}
				onEscapeKeyDown={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Preparando a importação</DialogTitle>
					<DialogDescription>
						Isso leva alguns segundos. Não feche esta janela.
					</DialogDescription>
				</DialogHeader>

				<ol className="space-y-2.5">
					{IMPORT_PROGRESS_STEPS.map((entry, index) => {
						const isDone = currentIndex > index;
						const isCurrent = currentIndex === index;

						return (
							<li
								key={entry.id}
								className={cn(
									"flex items-center gap-2 text-sm",
									isCurrent
										? "font-medium text-foreground"
										: isDone
											? "text-muted-foreground"
											: "text-muted-foreground/60",
								)}
							>
								{isDone ? (
									<RiCheckboxCircleLine className="size-4 shrink-0 text-positive" />
								) : isCurrent ? (
									<RiLoader4Line className="size-4 shrink-0 animate-spin text-primary" />
								) : (
									<span
										aria-hidden="true"
										className="size-4 shrink-0 rounded-full border border-current opacity-40"
									/>
								)}
								{entry.label}
							</li>
						);
					})}
				</ol>
			</DialogContent>
		</Dialog>
	);
}
